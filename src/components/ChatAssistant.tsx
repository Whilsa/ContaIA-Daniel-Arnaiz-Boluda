import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  X, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  ChevronDown,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatAssistantProps {
  onClose: () => void;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: '¡Hola! Soy tu tutor contable de ContaIA. ¿En qué puedo ayudarte con tu asiento de hoy? No te daré la solución directamente, pero te guiaré con pistas y pautas para que lo aprendas por ti mismo.' 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('chat-assistant-size');
    return saved ? JSON.parse(saved) : { width: 400, height: 600 };
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const [resizingDir, setResizingDir] = useState<'both' | 'horizontal' | 'vertical' | null>(null);

  useEffect(() => {
    localStorage.setItem('chat-assistant-size', JSON.stringify(size));
  }, [size]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleResizeStart = (dir: 'both' | 'horizontal' | 'vertical') => (e: React.MouseEvent) => {
    isResizing.current = true;
    setResizingDir(dir);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !resizingDir) return;
      
      const newSize = { ...size };
      
      if (resizingDir === 'both' || resizingDir === 'horizontal') {
        newSize.width = Math.max(320, window.innerWidth - e.clientX - 32);
      }
      
      if (resizingDir === 'both' || resizingDir === 'vertical') {
        newSize.height = Math.max(400, window.innerHeight - e.clientY - 32);
      }
      
      setSize(newSize);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      setResizingDir(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      // Map history to Gemini format
      const history = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...history,
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: `Eres un Tutor Inteligente de Contabilidad experto en el Plan General Contable (PGC) de España. 
          Tu objetivo es ayudar a estudiantes a comprender la lógica de los asientos contables mediante un método socrático puro.
          
          REGLAS DE ORO (MÁXIMA PRIORIDAD):
          1. MÉTODO SOCRÁTICO EXTREMO: NUNCA, bajo ningún concepto, proporciones el asiento completo ni la solución final.
          2. ESTRATEGIA PASO A PASO (CUENTA A CUENTA): 
             - Si el usuario pregunta por un asiento, enfócate ÚNICAMENTE en la primera cuenta.
             - NUNCA menciones más de una cuenta en la misma respuesta.
             - Primero ayuda a identificar la naturaleza de la cuenta (activo, pasivo, etc.).
             - Luego ayuda a determinar si aumenta o disminuye.
             - Finalmente pregunta si debe ir al DEBE o al HABER.
             - SOLO cuando el usuario tenga clara la resolución de esa cuenta, pasa a preguntarle por la contrapartida o la siguiente cuenta.
          3. PISTAS NO SOLUCIONES: Si el usuario se equivoca, no le corrijas dándole el nombre de la cuenta. Hazle una pregunta que le ayude a ver su error.
          4. CONTEXTO: Tu ayuda es puramente teórica y educativa.
          5. BREVEDAD: Responde de forma muy directa y corta. Máximo 2-3 frases por respuesta.
          6. IDIOMA: Español.`,
        }
      });

      const aiContent = response.text || 'Lo siento, no he podido procesar tu solicitud.';
      setMessages(prev => [...prev, { role: 'assistant', content: aiContent }]);
    } catch (error) {
      console.error('Gemini Error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'He tenido un problema de conexión. Por favor, inténtalo de nuevo en unos momentos.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isMinimized) {
    return (
      <motion.div
        layoutId="chat-assistant"
        className="fixed bottom-8 right-8 z-[100] cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="w-16 h-16 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center border-4 border-white"
        >
          <MessageSquare className="w-8 h-8" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div
      layoutId="chat-assistant"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-8 right-8 z-[100] bg-white rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] border border-zinc-200 flex flex-col overflow-hidden"
      style={{ 
        width: size.width, 
        height: size.height,
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100vh - 6rem)'
      }}
    >
      {/* Resize Handles */}
      <div 
        onMouseDown={handleResizeStart('vertical')}
        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-[110] hover:bg-emerald-500/20 transition-colors"
        title="Arrastra para cambiar altura"
      />
      <div 
        onMouseDown={handleResizeStart('horizontal')}
        className="absolute top-0 left-0 bottom-0 w-2 cursor-ew-resize z-[110] hover:bg-emerald-500/20 transition-colors"
        title="Arrastra para cambiar anchura"
      />
      <div 
        onMouseDown={handleResizeStart('both')}
        className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize z-[120] hover:bg-emerald-500/40 transition-colors rounded-br-full"
        title="Arrastra para cambiar tamaño"
      />
      
      {/* Header */}
      <div className="bg-zinc-900 px-6 py-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Profesor IA</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">En línea</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsMinimized(true)}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50"
      >
        {messages.map((m, idx) => (
          <div 
            key={idx}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                m.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
              }`}>
                {m.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div className={`rounded-2xl p-4 text-[13px] leading-relaxed relative ${
                m.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white text-zinc-700 shadow-sm border border-zinc-100 rounded-tl-none'
              }`}>
                <div className="markdown-body">
                  <Markdown>{m.content}</Markdown>
                </div>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex-shrink-0 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div className="bg-white text-zinc-400 shadow-sm border border-zinc-100 rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[12px] font-medium italic">Consultando el PGC...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 bg-white border-t border-zinc-100">
        <div className="relative">
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre una cuenta o asiento..."
            className="w-full bg-zinc-100 border-transparent rounded-2xl pl-5 pr-14 py-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-3 text-[10px] text-center text-zinc-400 font-medium italic">
          Esta conversación es privada y no afecta a tus registros contables.
        </p>
      </div>
    </motion.div>
  );
};

export default ChatAssistant;
