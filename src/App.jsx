import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Receipt,
  Users,
  CheckSquare,
  Calculator,
  Plus,
  XCircle,
  Scan,
  ChevronRight,
  TrendingUp,
  CreditCard,
  UserPlus
} from 'lucide-react';
import { analyzeReceipt, autoAssignItems } from './services/gemini';
import { supabase } from './supabase';
import { Sparkles, BrainCircuit, UploadCloud } from 'lucide-react';

const App = () => {
  const [people, setPeople] = useState([]);
  const [newName, setNewName] = useState('');
  const [receiptData, setReceiptData] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(false);
  const [isWalmart, setIsWalmart] = useState(false);
  const [logicPrompt, setLogicPrompt] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: "Hi! I'm your Split Assistant. Tell me how you want to split the items, or tag people with @ and items with #." }
  ]);
  const [showMentions, setShowMentions] = useState(null); // 'people' or 'items'
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isCached, setIsCached] = useState(false);
  const [step, setStep] = useState(1); // 1: Upload/Scan, 2: Assign, 3: Results

  // Load cache from localStorage
  const [analysisCache, setAnalysisCache] = useState(() => {
    const saved = localStorage.getItem('splitwise_analysis_cache');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('splitwise_analysis_cache', JSON.stringify(analysisCache));
  }, [analysisCache]);

  useEffect(() => {
    const checkCache = async () => {
      if (selectedFile) {
        const hash = await getFileHash(selectedFile);
        const cacheKey = `${hash}_${isWalmart}`;
        setIsCached(!!analysisCache[cacheKey]);
      } else {
        setIsCached(false);
      }
    };
    checkCache();
  }, [selectedFile, isWalmart, analysisCache]);

  const getFileHash = async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const addPerson = (e) => {
    e?.preventDefault();
    if (!newName.trim()) return;
    if (people.includes(newName.trim())) return;
    setPeople([...people, newName.trim()]);
    setNewName('');
  };

  const removePerson = (name) => {
    setPeople(people.filter(p => p !== name));
    const newAssignments = { ...assignments };
    Object.keys(newAssignments).forEach(itemId => {
      newAssignments[itemId] = (newAssignments[itemId] || []).filter(p => p !== name);
    });
    setAssignments(newAssignments);
  };

  const onDrop = async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const startAnalysis = async () => {
    if (!selectedFile) return;
    setLoading(true);
    try {
      const hash = await getFileHash(selectedFile);
      const cacheKey = `${hash}_${isWalmart}`;

      if (analysisCache[cacheKey]) {
        console.log("🚀 Using cached analysis result");
        processAnalyzedData(analysisCache[cacheKey]);
        return;
      }

      const data = await analyzeReceipt(selectedFile, isWalmart);
      // Save to cache
      setAnalysisCache(prev => ({ ...prev, [cacheKey]: data }));
      processAnalyzedData(data);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const processAnalyzedData = (data) => {
    const itemsWithIds = data.items.map((item, index) => ({
      ...item,
      id: index + 1
    }));
    setReceiptData({ ...data, items: itemsWithIds });
    setStep(2);
  };

  const clearCurrentFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const clearCache = () => {
    setAnalysisCache({});
    alert("Analysis cache cleared!");
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  });

  const toggleAssignment = (itemId, personName) => {
    const current = assignments[itemId] || [];
    if (current.includes(personName)) {
      setAssignments({
        ...assignments,
        [itemId]: current.filter(p => p !== personName)
      });
    } else {
      setAssignments({
        ...assignments,
        [itemId]: [...current, personName]
      });
    }
  };

  const selectAllForItem = (itemId) => {
    setAssignments({ ...assignments, [itemId]: [...people] });
  };

  const clearForItem = (itemId) => {
    setAssignments({ ...assignments, [itemId]: [] });
  };

  const individualResults = useMemo(() => {
    if (!receiptData || people.length === 0) return [];
    const data = {};
    people.forEach(p => data[p] = { subtotal: 0, itemCount: 0 });

    receiptData.items.forEach(item => {
      const assigned = assignments[item.id] || [];
      if (assigned.length > 0) {
        const share = item.price / assigned.length;
        assigned.forEach(p => {
          data[p].subtotal += share;
          data[p].itemCount += 1;
        });
      }
    });

    return people.map(p => {
      const subtotal = data[p].subtotal;
      const taxShare = receiptData.subtotal > 0 ? (subtotal / receiptData.subtotal) * receiptData.tax : 0;
      return { name: p, subtotal, taxShare, total: subtotal + taxShare, itemCount: data[p].itemCount };
    });
  }, [people, assignments, receiptData]);

  const unassignedItems = useMemo(() => {
    if (!receiptData) return [];
    return receiptData.items.filter(item => !assignments[item.id] || assignments[item.id].length === 0);
  }, [assignments, receiptData]);

  const groupedResults = useMemo(() => {
    if (!receiptData) return [];
    const groups = {};
    receiptData.items.forEach(item => {
      const assigned = (assignments[item.id] || []).slice().sort();
      if (assigned.length > 0) {
        const key = assigned.join(', ');
        if (!groups[key]) groups[key] = { items: [], subtotal: 0, sharers: assigned };
        groups[key].items.push(item);
        groups[key].subtotal += item.price;
      }
    });

    return Object.entries(groups).map(([key, data]) => {
      const taxShare = receiptData.subtotal > 0 ? (data.subtotal / receiptData.subtotal) * receiptData.tax : 0;
      const totalWithTax = data.subtotal + taxShare;
      return { key, ...data, taxShare, totalWithTax, perPersonShare: totalWithTax / data.sharers.length };
    });
  }, [assignments, receiptData]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setLogicPrompt(value);

    // Basic mention detection
    const lastChar = value[value.length - 1];
    const words = value.split(/\s/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('@')) {
      setShowMentions('people');
      setMentionFilter(lastWord.slice(1));
    } else if (lastWord.startsWith('#')) {
      setShowMentions('items');
      setMentionFilter(lastWord.slice(1));
    } else {
      setShowMentions(null);
    }
  };

  const insertMention = (name) => {
    const words = logicPrompt.split(/\s/);
    words[words.length - 1] = (showMentions === 'people' ? '@' : '#') + name + ' ';
    setLogicPrompt(words.join(' '));
    setShowMentions(null);
  };

  const handleAutoAssign = async (e) => {
    e?.preventDefault();
    if (!logicPrompt.trim() || people.length === 0) return;

    const userText = logicPrompt;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLogicPrompt('');
    setLoading(true);

    try {
      const suggestions = await autoAssignItems(receiptData, people, userText, assignments);
      setAssignments(suggestions);
      setMessages(prev => [...prev, { role: 'ai', text: "Done! I've updated the checkmarks based on your instructions. Anything else?" }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I had trouble processing that. Can you try rephrasing?" }]);
    } finally {
      setLoading(false);
    }
  };

  const saveToSupabase = async () => {
    if (!receiptData) return;
    setLoading(true);
    try {
      // 1. Upload image to Supabase Storage if it exists
      let imageUrl = null;
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
        imageUrl = data.publicUrl;
      }

      // 2. Save data to 'splits' table
      const { data, error } = await supabase
        .from('splits')
        .insert([
          {
            receipt_data: receiptData,
            people: people,
            assignments: assignments,
            individual_results: individualResults,
            image_url: imageUrl,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;
      alert("Split saved to history via Supabase!");
    } catch (error) {
      console.error("Error saving split:", error);
      alert("Failed to save split: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Navigation Headers */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 teal-gradient rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Receipt size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">SplitSmart</h1>
        </div>
        <div className="hidden md:flex gap-1 bg-slate-100 p-1 rounded-2xl">
          {[
            { id: 1, label: 'Scan', icon: Scan },
            { id: 2, label: 'Assign', icon: UserPlus },
            { id: 3, label: 'Results', icon: Calculator }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => receiptData && setStep(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${step === s.id
                ? 'bg-white text-teal-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-600'
                }`}
            >
              <s.icon size={16} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-xl mx-auto text-center"
          >
            <div className="mb-8">
              <h2 className="text-4xl font-extrabold mb-4 text-slate-900 tracking-tight">Snap. Scan. Split.</h2>
              <p className="text-slate-500 font-medium">Upload your receipt and let AI handle the heavy lifting.</p>
            </div>

            <div className="relative group">
              <div
                {...getRootProps()}
                className={`premium-card p-12 border-dashed border-2 cursor-pointer transition-all overflow-hidden ${isDragActive ? 'border-teal-500 bg-teal-50' : 'border-slate-300'
                  } ${previewUrl ? 'p-4' : 'p-12'}`}
              >
                <input {...getInputProps()} />

                {previewUrl ? (
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden shadow-inner bg-slate-100 flex items-center justify-center">
                    <img src={previewUrl} alt="Receipt Preview" className="h-full w-auto object-contain" />
                    {!loading && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <p className="text-white font-bold flex items-center gap-2">
                          <Scan size={20} /> Click to replace
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${loading ? 'bg-slate-100 animate-pulse' : 'bg-teal-50 text-teal-500'
                      }`}>
                      {loading ? <Scan className="animate-spin" size={40} /> : <Scan size={40} />}
                    </div>
                    {loading ? (
                      <div>
                        <p className="font-bold text-lg">Thinking...</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-bold text-lg text-slate-700">Click or drag receipt here</p>
                        <p className="text-slate-600 text-sm">PNG, JPG or PDF</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {previewUrl && !loading && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearCurrentFile(); }}
                  className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-10"
                >
                  <XCircle size={20} />
                </button>
              )}
            </div>

            {previewUrl && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex flex-col gap-3"
              >
                <button
                  onClick={startAnalysis}
                  disabled={loading}
                  className="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-teal-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <BrainCircuit className="animate-spin" size={24} />
                      AI ANALYZING...
                    </>
                  ) : (
                    <>
                      <Scan size={24} />
                      {isCached ? 'CONTINUE FROM CACHE' : 'SCAN WITH AI'}
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {/* Walmart Decoder Toggle */}
            <div className="mt-8 flex items-center justify-center gap-4">
              <label className="flex items-center cursor-pointer group bg-white px-6 py-4 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isWalmart}
                    onChange={() => setIsWalmart(!isWalmart)}
                  />
                  <div className={`block w-12 h-7 rounded-full transition-colors ${isWalmart ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${isWalmart ? 'translate-x-5' : ''}`}></div>
                </div>
                <div className="ml-4 text-left">
                  <p className="text-slate-800 font-bold text-sm tracking-tight transition-colors">Walmart Receipt Mode</p>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest leading-tight">Auto-decode item codes</p>
                </div>
              </label>
            </div>

            {/* Demo & Cache Controls */}
            <div className="mt-12 flex flex-col items-center gap-4 border-t border-slate-100 pt-8">
              <button
                onClick={() => {
                  setReceiptData({
                    items: [
                      { id: 1, name: "Burger", price: 15.00 },
                      { id: 2, name: "Fries", price: 5.00 },
                      { id: 3, name: "Coke", price: 3.00 }
                    ],
                    subtotal: 23.00,
                    tax: 2.00,
                    total: 25.00
                  });
                  setStep(2);
                }}
                className="text-slate-600 text-sm hover:text-teal-600 font-semibold transition-colors flex items-center gap-2"
              >
                Or use demo data to try it out
              </button>

              <button
                onClick={clearCache}
                className="text-xs text-slate-400 hover:text-red-500 font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                Clear AI Analysis Cache ({Object.keys(analysisCache).length})
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Left: People & Receipt Info */}
            <div className="lg:col-span-4 space-y-6">
              <section className="premium-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Users className="text-teal-500" size={20} />
                  <h3 className="font-bold text-slate-800">Add Friends</h3>
                </div>
                <form onSubmit={addPerson} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Friend's name"
                    className="premium-input flex-1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button type="submit" className="btn-primary p-3 flex items-center justify-center">
                    <Plus size={20} />
                  </button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {people.map(p => (
                    <div key={p} className="bg-slate-100 px-3 py-1.5 rounded-xl flex items-center gap-2 text-sm font-semibold text-slate-600">
                      {p}
                      <XCircle size={14} className="cursor-pointer text-slate-600 hover:text-red-500" onClick={() => removePerson(p)} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="premium-card flex flex-col h-[500px] border-2 border-teal-100 bg-white overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-teal-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white">
                      <BrainCircuit size={16} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm">AI Assistant</h3>
                  </div>
                  <div className="flex gap-1 text-[10px] items-center text-teal-600 font-bold uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                    Ready to Help
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user'
                        ? 'bg-teal-600 text-white rounded-tr-none'
                        : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                        }`}>
                        {msg.text}
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none animate-pulse flex gap-1">
                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-slate-100 relative">
                  {showMentions && (
                    <div className="absolute bottom-full left-4 mb-2 bg-white border border-slate-100 rounded-xl shadow-xl w-64 max-h-48 overflow-y-auto z-50">
                      {showMentions === 'people' ? (
                        people.filter(p => p.toLowerCase().includes(mentionFilter.toLowerCase())).map(p => (
                          <button
                            key={p}
                            onClick={() => insertMention(p)}
                            className="w-full text-left p-2 hover:bg-teal-50 text-sm font-semibold flex items-center gap-2 text-slate-800"
                          >
                            <Users size={14} className="text-teal-500" /> {p}
                          </button>
                        ))
                      ) : (
                        receiptData?.items.filter(item => item.name.toLowerCase().includes(mentionFilter.toLowerCase())).map(item => (
                          <button
                            key={item.id}
                            onClick={() => insertMention(item.name)}
                            className="w-full text-left p-2 hover:bg-teal-50 text-sm font-semibold flex items-center gap-2 text-slate-800 border-b border-slate-50 last:border-0"
                          >
                            <Receipt size={14} className="text-teal-500" />
                            <span className="flex-1 truncate">{item.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <form onSubmit={handleAutoAssign} className="flex gap-2">
                    <input
                      placeholder="Ask AI... use @ for friends, # for items"
                      className="premium-input flex-1 py-3"
                      value={logicPrompt}
                      onChange={handleInputChange}
                    />
                    <button
                      type="submit"
                      disabled={loading || !logicPrompt.trim()}
                      className="bg-teal-600 text-white p-3 rounded-2xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-md"
                    >
                      <Plus size={20} />
                    </button>
                  </form>
                </div>
              </section>

              <section className="premium-card p-6 bg-slate-900 text-white shadow-xl">
                <div className="space-y-4">
                  <div className="flex justify-between text-sm opacity-60">
                    <span>Subtotal</span>
                    <span>${receiptData?.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm opacity-60">
                    <span>Tax</span>
                    <span>${receiptData?.tax.toFixed(2)}</span>
                  </div>
                  <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                    <span className="text-sm font-medium">Total Amount</span>
                    <span className="text-3xl font-bold">${receiptData?.total.toFixed(2)}</span>
                  </div>
                </div>
              </section>

              <button
                onClick={() => setStep(3)}
                className={`w-full py-4 btn-primary flex items-center justify-center gap-2 text-lg ${people.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
              >
                View Final Split <ChevronRight />
              </button>
            </div>

            {/* Right: Items List */}
            <div className="lg:col-span-8">
              <div className="premium-card p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <CheckSquare className="text-teal-500" size={20} />
                    <h3 className="font-bold text-xl text-slate-800">Assign Items</h3>
                  </div>
                  <span className="text-sm text-slate-600 font-bold uppercase tracking-widest">{receiptData?.items.length} items found</span>
                </div>

                <div className="space-y-6">
                  {receiptData?.items.map(item => (
                    <div key={item.id} className="pb-6 border-b border-slate-100 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-bold text-lg text-slate-800 leading-tight">{item.name}</h4>
                          <span className="text-teal-600 font-bold text-sm tracking-wider uppercase">${item.price.toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => selectAllForItem(item.id)} className="text-[10px] font-bold text-slate-600 hover:text-teal-600 px-3 py-1 bg-slate-50 rounded-full uppercase tracking-widest border border-slate-100 transition-colors">Split All</button>
                          <button onClick={() => clearForItem(item.id)} className="text-[10px] font-bold text-slate-600 hover:text-red-500 px-3 py-1 bg-slate-50 rounded-full uppercase tracking-widest border border-slate-100 transition-colors">Reset</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {people.length === 0 ? (
                          <p className="text-xs text-slate-600 italic">Add friends to assign this item</p>
                        ) : people.map(p => {
                          const active = (assignments[item.id] || []).includes(p);
                          return (
                            <button
                              key={p}
                              onClick={() => toggleAssignment(item.id, p)}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${active
                                ? 'bg-teal-500 border-teal-500 text-white shadow-md'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'
                                }`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Left: Summary Cards */}
            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="premium-card p-6 flex items-center gap-4 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-teal-50 text-teal-500 rounded-2xl flex items-center justify-center">
                  <CreditCard />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-600 tracking-widest mb-0.5">Total Bill</p>
                  <p className="text-2xl font-black text-slate-800">${receiptData?.total.toFixed(2)}</p>
                </div>
              </div>
              <div className="premium-card p-6 flex items-center gap-4 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center">
                  <Users />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-600 tracking-widest mb-0.5">Total People</p>
                  <p className="text-2xl font-black text-slate-800">{people.length}</p>
                </div>
              </div>
              <div className="premium-card p-6 flex items-center gap-4 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center">
                  <TrendingUp />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-600 tracking-widest mb-0.5">Avg / Person</p>
                  <p className="text-2xl font-black text-slate-800">${(receiptData?.total / people.length).toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Individual Breakdown */}
            <div className="lg:col-span-5 space-y-6">
              <div className="premium-card p-8">
                <div className="flex items-center gap-3 mb-8">
                  <Calculator className="text-teal-500" size={24} />
                  <h3 className="font-bold text-xl text-slate-800">Individual Totals</h3>
                </div>
                <div className="space-y-4">
                  {individualResults.map(res => (
                    <div key={res.name} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors">
                      <div>
                        <p className="font-bold text-lg text-slate-900 leading-none mb-1">{res.name}</p>
                        <p className="text-[10px] uppercase font-bold text-slate-600 tracking-widest font-mono">{res.itemCount} Items</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-teal-600">${res.total.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">inc. tax</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Grouped Breakdown */}
            <div className="lg:col-span-7 space-y-6">
              <div className="premium-card p-8">
                <div className="flex items-center gap-3 mb-8">
                  <CheckSquare className="text-teal-500" size={24} />
                  <h3 className="font-bold text-xl text-slate-800">Split Breakdown</h3>
                </div>
                <div className="space-y-6">
                  {groupedResults.map(group => (
                    <div key={group.key} className="rounded-3xl border border-slate-100 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
                      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">Shared By</p>
                        <p className="font-bold text-slate-800 tracking-tight">{group.key}</p>
                      </div>
                      <div className="p-6">
                        <ul className="space-y-2 mb-6">
                          {group.items.map((it, idx) => (
                            <li key={idx} className="flex justify-between text-sm text-slate-500">
                              <span>{it.name}</span>
                              <span className="font-bold text-slate-600">${it.price.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex justify-between items-end pt-6 border-t border-dashed border-slate-200">
                          <div>
                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-0.5">Per Person</p>
                            <p className="text-3xl font-black text-indigo-600 tracking-tighter">${group.perPersonShare.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-0.5">Group Total</p>
                            <p className="font-extrabold text-slate-800">${group.totalWithTax.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {unassignedItems.length > 0 && (
                    <div className="rounded-3xl border-2 border-dashed border-red-100 bg-red-50/30 overflow-hidden">
                      <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Leftover</p>
                          <p className="font-bold text-red-900 tracking-tight">Unassigned Items</p>
                        </div>
                        <span className="bg-red-100 text-red-600 text-[10px] font-black py-1 px-3 rounded-full uppercase tracking-widest">
                          Attention required
                        </span>
                      </div>
                      <div className="p-6">
                        <ul className="space-y-2">
                          {unassignedItems.map((it, idx) => (
                            <li key={idx} className="flex justify-between text-sm text-red-700/70">
                              <span>{it.name}</span>
                              <span className="font-bold text-red-900/50">${it.price.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={saveToSupabase}
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-lg tracking-tight flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.98]"
              >
                {loading ? "SAVING..." : "SAVE SPLIT TO HISTORY"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-24 text-center py-10 border-t border-slate-100 opacity-50">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em]">Designed with AI Intelligence & Premium Experience • 2026</p>
      </footer>
    </div>
  );
};

export default App;
