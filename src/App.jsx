import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Receipt, Users, CheckSquare, Calculator, Plus, XCircle, Scan,
  ChevronRight, TrendingUp, CreditCard, UserPlus, Sparkles,
  BrainCircuit, UploadCloud, Lock, LogIn, Key, ShieldCheck, RotateCcw,
  FileEdit, Maximize2, Minimize2, Save, Image as ImageIcon
} from 'lucide-react';
import { analyzeReceipt, autoAssignItems, fetchAvailableModels } from './services/gemini';
import { supabase } from './supabase';

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
  const [splitId, setSplitId] = useState(null);
  const [step, setStep] = useState(1); // 1: Upload/Scan, 2: Assign, 3: Results
  const [adminPassword, setAdminPassword] = useState('');
  const [viewPassword, setViewPassword] = useState('');
  const [showJoinSplit, setShowJoinSplit] = useState(false);

  const chatInputRef = React.useRef(null);

  const { id: urlId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [accessIdInput, setAccessIdInput] = useState('');
  const [accessPassInput, setAccessPassInput] = useState('');
  const [userRole, setUserRole] = useState(null); // 'admin' | 'guest'
  const [isVerifying, setIsVerifying] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [previewingId, setPreviewingId] = useState(null);
  const [originalAssignments, setOriginalAssignments] = useState({});
  const [suggestorName, setSuggestorName] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('gemini_selected_model') || 'gemini-1.5-flash';
  });

  useEffect(() => {
    localStorage.setItem('gemini_api_key', userApiKey);
    if (userApiKey && userApiKey.length > 20) {
      fetchAvailableModels(userApiKey)
        .then(setAvailableModels)
        .catch(err => console.error("Failed to fetch models", err));
    }
  }, [userApiKey]);

  useEffect(() => {
    localStorage.setItem('gemini_selected_model', selectedModel);
  }, [selectedModel]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(assignments) !== JSON.stringify(originalAssignments);
  }, [assignments, originalAssignments]);

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

  const updateReceiptItem = (index, field, value) => {
    const newItems = [...receiptData.items];
    newItems[index][field] = field === 'price' ? parseFloat(value) || 0 : value;
    setReceiptData({ ...receiptData, items: newItems });
  };

  const addReceiptItem = () => {
    const newId = (receiptData?.items?.length || 0) > 0 ? Math.max(...receiptData.items.map(i => i.id)) + 1 : 1;
    const newItem = { id: newId, name: "New Item", price: 0 };
    setReceiptData({ ...receiptData, items: [...(receiptData?.items || []), newItem] });
  };

  const removeReceiptItem = (index) => {
    const removedItem = receiptData.items[index];
    const newItems = receiptData.items.filter((_, i) => i !== index);
    setReceiptData({ ...receiptData, items: newItems });
    // Cleanup assignments for removed item
    if (removedItem) {
      const newAssignments = { ...assignments };
      delete newAssignments[removedItem.id];
      setAssignments(newAssignments);
    }
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

      const data = await analyzeReceipt(selectedFile, isWalmart, userApiKey, selectedModel);
      // Save to cache
      setAnalysisCache(prev => ({ ...prev, [cacheKey]: data }));
      processAnalyzedData(data);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSplit = async (id, password) => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase
        .from('splits')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) throw new Error("Split not found");
      if (password === data.admin_password) setUserRole('admin');
      else if (password === data.view_password) setUserRole('guest');
      else throw new Error("Invalid password");
      setReceiptData(data.receipt_data);
      setPeople(data.people);
      setAssignments(data.assignments);
      setOriginalAssignments(data.assignments);
      setSplitId(data.id);
      setAdminPassword(data.admin_password);
      setViewPassword(data.view_password);
      setPreviewUrl(data.image_url);
      setStep(3);

      fetchSuggestions(data.id);

      if (urlId !== id) navigate(`/split/${id}?pass=${password}`);
    } catch (error) {
      alert(error.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchSuggestions = async (sId) => {
    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .eq('split_id', sId)
      .eq('status', 'pending');

    if (!error && data) setPendingSuggestions(data);
  };

  const approveSuggestion = async (suggestion) => {
    setLoading(true);
    try {
      // 1. Handle Person Logic
      const currentPeople = new Set(people);
      const newPeople = (suggestion.suggested_people || []).filter(p => !currentPeople.has(p));
      if (newPeople.length > 0) {
        setPeople(prev => [...prev, ...newPeople]);
      }

      // Handle Data Correction
      if (suggestion.suggested_data) {
        setReceiptData(suggestion.suggested_data);
      }

      // 2. Handle Assignment Merge Logic & Diffing for the "Info Block"
      let addedCount = 0;
      let removedCount = 0;
      let unchangedCount = 0;

      // We compare suggestion vs current admin state (assignments)
      Object.keys(suggestion.suggested_assignments).forEach(itemId => {
        const suggestedP = suggestion.suggested_assignments[itemId] || [];
        const currentP = assignments[itemId] || [];

        suggestedP.forEach(p => {
          if (currentP.includes(p)) unchangedCount++;
          else addedCount++;
        });

        currentP.forEach(p => {
          if (!suggestedP.includes(p)) removedCount++;
        });
      });

      setAssignments(suggestion.suggested_assignments);
      setOriginalAssignments(suggestion.suggested_assignments);

      await supabase
        .from('suggestions')
        .update({ status: 'approved' })
        .eq('id', suggestion.id);

      setPendingSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      setPreviewingId(null);

      // Build detailed summary
      const summary = [
        "Suggestion Applied!",
        newPeople.length > 0 ? `• Added ${newPeople.join(', ')} to friends.` : null,
        suggestion.suggested_data ? `• Updated item names/prices.` : null,
        addedCount > 0 ? `• ${addedCount} new assignments added.` : null,
        removedCount > 0 ? `• ${removedCount} previous assignments removed.` : null,
        unchangedCount > 0 ? `• ${unchangedCount} assignments were already correct (no change).` : null
      ].filter(Boolean).join('\n');

      alert(summary + "\n\nClick SAVE to commit changes.");
    } catch (error) {
      console.error(error);
      alert("Failed to apply suggestion");
    } finally {
      setLoading(false);
    }
  };

  const rejectSuggestion = async (suggestionId) => {
    await supabase
      .from('suggestions')
      .update({ status: 'rejected' })
      .eq('id', suggestionId);
    setPendingSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    setPreviewingId(null);
  };

  useEffect(() => {
    const pass = searchParams.get('pass');
    if (urlId && pass) {
      loadSplit(urlId, pass);
    }
  }, [urlId, searchParams]);

  const processAnalyzedData = (data) => {
    const itemsWithIds = data.items.map((item, index) => ({
      ...item,
      id: index + 1
    }));
    setReceiptData({ ...data, items: itemsWithIds });
    setStep(2); // Go to Verify step
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
      const suggestions = await autoAssignItems(receiptData, people, userText, assignments, userApiKey, selectedModel);
      setAssignments(suggestions);
      setMessages(prev => [...prev, { role: 'ai', text: "Done! I've updated the checkmarks based on your instructions. Anything else?" }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I had trouble processing that. Can you try rephrasing?" }]);
    } finally {
      setLoading(false);
    }
  };

  const saveToSupabase = async (providedName) => {
    if (!receiptData) return;
    setLoading(true);
    try {
      if (userRole === 'guest') {
        const { error } = await supabase
          .from('suggestions')
          .insert([{
            split_id: splitId,
            suggestor_name: providedName || suggestorName,
            suggested_assignments: assignments,
            suggested_people: people,
            suggested_data: receiptData, // Include item data corrections
            status: 'pending'
          }]);
        if (error) throw error;
        setShowSubmitModal(false);
        alert("Suggestion submitted to Admin!");
        fetchSuggestions(splitId); // Refresh list
        return;
      }

      const isUpdate = !!splitId;
      const id = splitId || Math.random().toString(36).substring(2, 9).toUpperCase();
      const adminPass = adminPassword || Math.random().toString(36).substring(2, 6);
      const viewPass = viewPassword || Math.random().toString(36).substring(2, 6);

      let imageUrl = previewUrl;
      // 1. Upload image only if it's a new file (not a URL)
      if (selectedFile && typeof selectedFile !== 'string') {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${id}_receipt.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
        imageUrl = data.publicUrl;
      }

      const payload = {
        id,
        receipt_data: receiptData,
        people,
        assignments,
        individual_results: individualResults,
        image_url: imageUrl,
        admin_password: adminPass,
        view_password: viewPass,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('splits')
        .upsert([payload]);

      if (error) throw error;

      setSplitId(id);
      setAdminPassword(adminPass);
      setViewPassword(viewPass);
      if (!splitId) setUserRole('admin'); // Creator becomes admin

      alert(isUpdate ? "Changes Saved!" : "Split Created!");
    } catch (error) {
      console.error("Error saving split:", error);
      alert("Error: " + error.message);
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
          {userRole && (
            <div className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${userRole === 'admin' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
              }`}>
              {userRole}
            </div>
          )}
        </div>
        <div className="hidden md:flex gap-1 bg-slate-100 p-1 rounded-2xl">
          {[
            { id: 1, label: 'Scan', icon: Scan },
            { id: 2, label: 'Edit', icon: FileEdit },
            { id: 3, label: 'Assign', icon: UserPlus },
            { id: 4, label: 'Results', icon: Calculator }
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
            <div className="mb-12">
              <h2 className="text-5xl font-black mb-4 text-slate-900 tracking-tight leading-none text-center">Snap. Scan. Split.</h2>
              <p className="text-slate-500 font-medium text-lg text-center">Upload your receipt or join an existing split.</p>
            </div>

            {!showJoinSplit && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-6 premium-card bg-teal-50/30 border-teal-100"
              >
                <div className="flex items-center gap-3 mb-4">
                  <BrainCircuit className="text-teal-600" size={20} />
                  <p className="text-xs font-black text-teal-800 uppercase tracking-widest">AI Intelligence Config</p>
                </div>
                <div className="space-y-4">
                  <div className="premium-input bg-white/70 backdrop-blur-sm shadow-inner flex items-center gap-3 px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 transition-all">
                    <Key size={16} className="text-teal-400 shrink-0" />
                    <input
                      type="password"
                      placeholder="Enter your Gemini API Key..."
                      className="bg-transparent border-none outline-none w-full p-0 text-slate-700"
                      value={userApiKey}
                      onChange={(e) => setUserApiKey(e.target.value)}
                    />
                  </div>

                  <div className="premium-input bg-white/70 backdrop-blur-sm shadow-inner flex items-center gap-3 px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 transition-all animate-fade-in cursor-pointer">
                    <BrainCircuit size={16} className="text-teal-400 shrink-0" />
                    <select
                      className="bg-transparent border-none outline-none w-full p-0 text-slate-700 appearance-none cursor-pointer"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      {availableModels.map(m => (
                        <option key={m.name} value={m.name}>
                          {m.displayName} ({m.name})
                        </option>
                      ))}
                    </select>
                    <Plus size={14} className="text-teal-400 rotate-45 shrink-0" />
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-slate-500 font-bold text-left italic">
                  Note: The selected model will be used for scanning and splitting logic. Key is stored locally.
                </p>
              </motion.div>
            )}

            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setShowJoinSplit(false)}
                className={`flex-1 py-4 rounded-3xl font-bold transition-all flex items-center justify-center gap-2 ${!showJoinSplit ? 'bg-white shadow-md text-teal-600' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Scan size={20} /> NEW SCAN
              </button>
              <button
                onClick={() => setShowJoinSplit(true)}
                className={`flex-1 py-4 rounded-3xl font-bold transition-all flex items-center justify-center gap-2 ${showJoinSplit ? 'bg-white shadow-md text-teal-600' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Key size={20} /> JOIN SPLIT
              </button>
            </div>

            {!showJoinSplit ? (
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
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="premium-card p-8 space-y-6"
              >
                <div className="space-y-4">
                  <div className="text-left">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Split ID</label>
                    <div className="premium-input flex items-center gap-3 px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 transition-all mt-1">
                      <Lock size={18} className="text-slate-400 shrink-0" />
                      <input
                        className="bg-transparent border-none outline-none w-full p-0 text-slate-800 font-bold placeholder:text-slate-300"
                        placeholder="ENTER SPLIT ID"
                        value={accessIdInput}
                        onChange={(e) => setAccessIdInput(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                  <div className="text-left">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                    <div className="premium-input flex items-center gap-3 px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 transition-all mt-1">
                      <Key size={18} className="text-slate-400 shrink-0" />
                      <input
                        type="password"
                        className="bg-transparent border-none outline-none w-full p-0 text-slate-800 placeholder:text-slate-300"
                        placeholder="••••"
                        value={accessPassInput}
                        onChange={(e) => setAccessPassInput(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => loadSplit(accessIdInput, accessPassInput)}
                  disabled={isVerifying || !accessIdInput || !accessPassInput}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all disabled:opacity-50 shadow-xl"
                >
                  {isVerifying ? <BrainCircuit className="animate-spin" size={20} /> : <LogIn size={20} />}
                  JOIN SPLIT
                </button>
              </motion.div>
            )}

            {previewUrl && !showJoinSplit && (
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
                  setStep(2); // Go to Edit step
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
            {/* Left: View Receipt Card */}
            <div className={`${isImageExpanded ? 'lg:col-span-12' : 'lg:col-span-4'} transition-all duration-500`}>
              <div className="premium-card p-4 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="text-teal-500" size={18} />
                    <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                      Receipt View
                      {isImageExpanded && <span className="text-[10px] bg-teal-100 text-teal-600 px-2 py-0.5 rounded-full uppercase">Expanded</span>}
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsImageExpanded(!isImageExpanded)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                    >
                      {isImageExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                  </div>
                </div>
                <div className={`relative rounded-xl overflow-hidden bg-slate-100 shadow-inner group ${isImageExpanded ? 'aspect-auto' : 'aspect-[3/4]'}`}>
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Receipt"
                      className={`w-full h-full object-contain ${isImageExpanded ? 'max-h-[85vh]' : ''}`}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <Scan size={48} className="mb-2 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-wider">No Image Preview</p>
                    </div>
                  )}
                  {!isImageExpanded && (
                    <div className="absolute inset-0 bg-slate-900/0 hover:bg-slate-900/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer" onClick={() => setIsImageExpanded(true)}>
                      <Maximize2 className="text-white drop-shadow-md" size={32} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Edit Items List */}
            <div className={`${isImageExpanded ? 'hidden' : 'lg:col-span-8'}`}>
              <div className="premium-card p-8 border-2 border-teal-50">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center">
                      <FileEdit size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl text-slate-800 tracking-tight">Verify & Correct Items</h3>
                      <p className="text-xs text-slate-400 font-medium tracking-tight leading-tight">Was the AI accurate? Correct its mistakes here.</p>
                    </div>
                  </div>
                  <button
                    onClick={addReceiptItem}
                    className="px-4 py-2 bg-white text-teal-600 rounded-xl text-[10px] font-black uppercase hover:bg-teal-50 transition-all border border-teal-100 flex items-center gap-2 shadow-sm"
                  >
                    <Plus size={14} /> Add Item
                  </button>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar p-1">
                  {receiptData?.items.map((item, idx) => (
                    <div key={idx} className="flex gap-4 items-end bg-white p-4 rounded-2xl border border-slate-100 group transition-all hover:border-teal-300 hover:shadow-md">
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block leading-none">Item Description</label>
                        <input
                          type="text"
                          className="premium-input bg-slate-50 border-none shadow-none focus:bg-white focus:ring-2 focus:ring-teal-100 text-slate-800 font-bold"
                          value={item.name}
                          onChange={(e) => updateReceiptItem(idx, 'name', e.target.value)}
                        />
                      </div>
                      <div className="w-32">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block leading-none">Price</label>
                        <div className="premium-input bg-slate-50 border-none shadow-none focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 flex items-center gap-2 px-4 transition-all">
                          <span className="text-slate-400 font-bold select-none">$</span>
                          <input
                            type="number"
                            step="0.01"
                            className="bg-transparent border-none outline-none w-full text-teal-600 font-black p-0"
                            value={item.price}
                            onChange={(e) => updateReceiptItem(idx, 'price', e.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeReceiptItem(idx)}
                        className="p-3 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 bg-slate-50 rounded-xl hover:bg-red-50"
                      >
                        <XCircle size={18} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Subtotal</label>
                    <div className="premium-input bg-slate-50 border-none shadow-none focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 flex items-center gap-2 px-4 transition-all">
                      <span className="text-slate-400 font-bold select-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        className="bg-transparent border-none outline-none w-full text-slate-800 font-bold p-0"
                        value={receiptData?.subtotal}
                        onChange={(e) => setReceiptData({ ...receiptData, subtotal: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Tax</label>
                    <div className="premium-input bg-slate-50 border-none shadow-none focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 flex items-center gap-2 px-4 transition-all">
                      <span className="text-slate-400 font-bold select-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        className="bg-transparent border-none outline-none w-full text-slate-800 font-bold p-0"
                        value={receiptData?.tax}
                        onChange={(e) => setReceiptData({ ...receiptData, tax: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest ml-1 mb-1 block font-black">Grand Total</label>
                    <div className="premium-input border-teal-200 bg-teal-50/30 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-100 flex items-center gap-2 px-4 transition-all">
                      <span className="text-teal-500 font-bold select-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        className="bg-transparent border-none outline-none w-full text-teal-700 font-black p-0"
                        value={receiptData?.total}
                        onChange={(e) => setReceiptData({ ...receiptData, total: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-12 flex gap-4">
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 py-4 bg-white border-2 border-slate-200 text-slate-800 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all"
                  >
                    <ChevronRight size={20} /> Skip to Assign
                  </button>
                  <button
                    onClick={() => userRole === 'guest' ? setShowSubmitModal(true) : setStep(3)}
                    className="flex-1 py-4 teal-gradient text-white rounded-2xl font-black text-lg tracking-tight flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-xl active:scale-[0.98]"
                  >
                    {userRole === 'guest' ? <Sparkles size={20} /> : <CheckSquare size={20} />}
                    {userRole === 'guest' ? 'Suggest Item Corrections' : 'Confirm & Next'}
                  </button>
                </div>
                {userRole === 'admin' && (
                  <p className="mt-4 text-[10px] text-slate-400 font-bold text-center uppercase tracking-widest">
                    Note: Changes here will be saved when you click QUICK SAVE in the next step.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {userRole === 'admin' && pendingSuggestions.length > 0 && (
              <div className="lg:col-span-12 space-y-4">
                <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-3xl animate-bounce-subtle">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-200 rounded-full flex items-center justify-center text-amber-700">
                        <ShieldCheck size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-amber-900 text-lg">
                          {pendingSuggestions.length} Pending Suggestion{pendingSuggestions.length > 1 ? 's' : ''}
                        </p>
                        <p className="text-amber-700 text-sm">Review changes from your friends before applying.</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-amber-200 pt-6">
                    {pendingSuggestions.map(s => (
                      <div key={s.id} className={`p-4 rounded-2xl border-2 transition-all shadow-sm ${previewingId === s.id ? 'bg-amber-100 border-amber-400' : 'bg-white border-amber-100'
                        }`}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="truncate pr-2">
                            <p className="font-bold text-slate-800 truncate">{s.suggestor_name || 'Friend'}</p>
                            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest leading-none">Suggested Split</p>
                          </div>
                          {previewingId === s.id && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse mt-1"></div>}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPreviewingId(previewingId === s.id ? null : s.id)}
                            className="flex-1 py-2 text-[10px] font-black uppercase rounded-xl border border-amber-300 hover:bg-amber-50 transition-colors"
                          >
                            {previewingId === s.id ? 'Exit View' : 'View'}
                          </button>
                          <button
                            onClick={() => approveSuggestion(s)}
                            className="flex-1 py-2 text-[10px] font-black uppercase bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => rejectSuggestion(s.id)}
                            className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition-colors"
                          >
                            <XCircle size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {previewingId && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-50 border-2 border-indigo-100 p-4 rounded-2xl flex items-center gap-3"
                  >
                    <Sparkles className="text-indigo-500 shrink-0" size={18} />
                    <p className="text-sm text-indigo-700 font-medium">
                      <strong>Merge Tip:</strong>
                      {(() => {
                        const sug = pendingSuggestions.find(s => s.id === previewingId);
                        const newP = (sug?.suggested_people || []).filter(p => !new Set(people).has(p));
                        if (newP.length > 0) return ` This suggestion includes adding ${newP.join(', ')}. They will be automatically added to your friends list if applied.`;
                        return " No new friends being added, just assignment changes.";
                      })()}
                    </p>
                  </motion.div>
                )}
              </div>
            )}

            {/* Left: People & Receipt Info */}
            <div className="lg:col-span-4 space-y-6">
              <section className="premium-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Users className="text-teal-500" size={20} />
                  <h3 className="font-bold text-slate-800">Assign & Add</h3>
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

                <div className="flex flex-wrap gap-2 mb-6">
                  {people.map(p => (
                    <div key={p} className="bg-slate-100 px-3 py-1.5 rounded-xl flex items-center gap-2 text-sm font-semibold text-slate-600 shadow-sm border border-slate-200">
                      {p}
                      {(!userRole || userRole === 'admin') && (
                        <XCircle size={14} className="cursor-pointer text-slate-600 hover:text-red-500" onClick={() => removePerson(p)} />
                      )}
                    </div>
                  ))}
                </div>

                {userRole === 'guest' && pendingSuggestions.length > 0 && (
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-3">Other Suggestions</p>
                    <div className="space-y-2">
                      {pendingSuggestions.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setAssignments(s.suggested_assignments);
                            setPeople(s.suggested_people || people);
                            alert(`Based your split on ${s.suggestor_name}'s Logic!`);
                          }}
                          className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-2xl text-left transition-colors flex items-center justify-between group"
                        >
                          <div>
                            <p className="text-xs font-bold text-indigo-700">{s.suggestor_name}</p>
                            <p className="text-[9px] text-indigo-400 font-bold uppercase">Split Logic</p>
                          </div>
                          <Sparkles size={14} className="text-indigo-300 group-hover:scale-125 transition-transform" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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

                  <form onSubmit={handleAutoAssign} className="flex gap-2 items-end">
                    <textarea
                      ref={chatInputRef}
                      rows="1"
                      placeholder="Ask AI... use @ for friends, # for items"
                      className="premium-input flex-1 py-3 h-auto min-h-[48px] max-h-32 resize-none overflow-y-auto"
                      value={logicPrompt}
                      onChange={(e) => {
                        handleInputChange(e);
                        // Auto-grow
                        e.target.style.height = 'inherit';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAutoAssign();
                        }
                      }}
                    />
                    <button
                      type="submit"
                      disabled={loading || !logicPrompt.trim()}
                      className="bg-teal-600 text-white p-3 rounded-2xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-md h-[48px] w-[48px] flex items-center justify-center shrink-0"
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

              <div className="space-y-3">
                <button
                  onClick={() => setStep(4)}
                  className={`w-full py-4 btn-primary flex items-center justify-center gap-2 text-lg ${people.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  View Final Split <ChevronRight />
                </button>

                <button
                  onClick={() => userRole === 'guest' ? setShowSubmitModal(true) : saveToSupabase()}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm tracking-tight flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98]"
                >
                  {loading ? "SAVING..." : (userRole === 'guest' ? "SUBMIT SUGGESTED SPLIT" : "QUICK SAVE & UPDATE")}
                </button>
              </div>
            </div>

            {/* Right: Items List */}
            <div className="lg:col-span-8">
              <div className={`premium-card p-8 transition-all duration-500 ${previewingId ? 'ring-4 ring-amber-400 border-amber-500 bg-amber-50/20' : ''}`}>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    {previewingId ? <ShieldCheck className="text-amber-500 animate-pulse" size={24} /> : <CheckSquare className="text-teal-500" size={20} />}
                    <h3 className="font-bold text-xl text-slate-800">
                      {previewingId ? 'Previewing Suggested Split' : 'Assign Items'}
                    </h3>
                  </div>
                  {previewingId && (
                    <span className="bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full animate-pulse uppercase tracking-widest">
                      Preview Mode
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 font-bold uppercase tracking-widest">{receiptData?.items.length} items found</span>
                    {userRole === 'guest' && hasChanges && (
                      <button
                        onClick={() => setAssignments(originalAssignments)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all border border-slate-200"
                      >
                        <RotateCcw size={12} /> Reset to Main
                      </button>
                    )}
                  </div>
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
                        {(() => {
                          const currentSuggestion = previewingId ? pendingSuggestions.find(s => s.id === previewingId) : null;
                          const suggestedPeople = currentSuggestion?.suggested_people || [];
                          const mergedPeople = Array.from(new Set([...people, ...suggestedPeople]));

                          if (mergedPeople.length === 0) {
                            return <p className="text-xs text-slate-600 italic">Add friends to assign this item</p>;
                          }

                          return mergedPeople.map(p => {
                            const displayAssignments = previewingId
                              ? (currentSuggestion?.suggested_assignments || {})
                              : assignments;

                            // Reference for diffing
                            const referenceAssignments = previewingId ? assignments : originalAssignments;

                            const isActive = (displayAssignments[item.id] || []).includes(p);
                            const wasActive = (referenceAssignments[item.id] || []).includes(p);

                            const isAdded = isActive && !wasActive;
                            const isRemoved = !isActive && wasActive;

                            return (
                              <button
                                key={p}
                                disabled={!!previewingId}
                                onClick={() => toggleAssignment(item.id, p)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border relative flex items-center gap-1.5 ${isActive
                                  ? (previewingId ? 'bg-amber-500 border-amber-500 text-white shadow-md' : 'bg-teal-500 border-teal-500 text-white shadow-md')
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'
                                  } ${previewingId ? 'opacity-90 cursor-not-allowed' : ''} ${isAdded ? 'ring-2 ring-green-400 ring-offset-2' : ''
                                  } ${isRemoved ? 'ring-2 ring-red-400 ring-offset-2 opacity-50' : ''
                                  }`}
                              >
                                {p}
                                {isAdded && <span className="text-[10px] bg-green-500 text-white w-4 h-4 rounded-full flex items-center justify-center">+</span>}
                                {isRemoved && <span className="text-[10px] bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center">-</span>}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
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
                onClick={() => userRole === 'guest' ? setShowSubmitModal(true) : saveToSupabase()}
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-lg tracking-tight flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.98]"
              >
                {loading ? "SAVING..." : (userRole === 'guest' ? "SUBMIT SUGGESTED SPLIT" : "SAVE & UPDATE SPLIT")}
              </button>

              {splitId && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 p-6 bg-teal-50 rounded-3xl border border-teal-100 space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">Shareable Details</span>
                    <span className="bg-teal-600 text-white text-[10px] font-black px-2 py-1 rounded-md">ID: {splitId}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-teal-100 overflow-hidden relative">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                        Admin Pass {userRole === 'admin' && <Sparkles size={10} className="text-teal-400" />}
                      </p>
                      {userRole === 'admin' ? (
                        <input
                          type="text"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="w-full bg-transparent font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-200 rounded-md px-1 -ml-1 border-b border-dashed border-slate-200"
                        />
                      ) : (
                        <div className="flex items-center gap-1 text-slate-300 italic text-[10px]">
                          <Lock size={10} /> Hidden for Viewers
                        </div>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-teal-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                        Share Pass {userRole === 'admin' && <Sparkles size={10} className="text-teal-400" />}
                      </p>
                      {userRole === 'admin' ? (
                        <input
                          type="text"
                          value={viewPassword}
                          onChange={(e) => setViewPassword(e.target.value)}
                          className="w-full bg-transparent font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-200 rounded-md px-1 -ml-1 border-b border-dashed border-slate-200"
                        />
                      ) : (
                        <p className="font-mono font-bold text-slate-800">{viewPassword}</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/split/${splitId}?pass=${viewPassword}`;
                        navigator.clipboard.writeText(link);
                        alert("Share link copied!");
                      }}
                      className="w-full py-3 bg-white border-2 border-teal-600 text-teal-600 rounded-2xl font-bold hover:bg-teal-600 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      COPY SHARE LINK
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-24 text-center py-10 border-t border-slate-100 opacity-50">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em]">Designed with AI Intelligence & Premium Experience • 2026</p>
      </footer>

      {/* Suggestion Submission Modal */}
      <AnimatePresence>
        {showSubmitModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="premium-card p-8 w-full max-w-md shadow-2xl"
            >
              <h3 className="text-2xl font-black text-slate-800 mb-2 font-outfit uppercase tracking-tight">Who are you?</h3>
              <p className="text-slate-500 text-sm mb-6 font-medium">Please select your name or enter it to submit this suggestion.</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {people.map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        setSuggestorName(p);
                        saveToSupabase(p);
                      }}
                      className={`p-3 rounded-2xl border-2 text-xs font-bold transition-all text-center h-[52px] flex items-center justify-center ${suggestorName === p ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-white border-slate-100 text-slate-600 hover:border-teal-200'
                        }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-teal-500">
                    <UserPlus size={16} />
                  </div>
                  <input
                    placeholder="Or enter your name..."
                    className="premium-input pl-12 py-4 shadow-inner"
                    value={suggestorName}
                    onChange={(e) => setSuggestorName(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setShowSubmitModal(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-colors uppercase text-xs tracking-widest"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!suggestorName.trim()}
                    onClick={() => saveToSupabase()}
                    className="flex-1 py-4 bg-teal-600 text-white rounded-2xl font-bold shadow-lg disabled:opacity-50 hover:bg-teal-700 transition-colors uppercase text-xs tracking-widest"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
