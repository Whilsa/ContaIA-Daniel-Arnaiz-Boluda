import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Transformer, Group } from 'react-konva';
import { 
  Pencil, 
  Eraser, 
  Minus, 
  Type, 
  Trash2, 
  Download, 
  X,
  Palette,
  MousePointer2,
  Hand,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  BookOpen,
  Columns2,
  Copy,
  Square
} from 'lucide-react';
import html2canvas from 'html2canvas';

interface JournalEntry {
  code?: string;
  account: string;
  debe: number;
  haber: number;
  date?: string;
}

interface WhiteboardPage {
  shapes: Shape[];
  scale: number;
  position: { x: number, y: number };
}

interface WhiteboardProps {
  entries: JournalEntry[][];
  onClose: () => void;
  pages: WhiteboardPage[];
  setPages: (pages: WhiteboardPage[]) => void;
  currentPageIndex: number;
  setCurrentPageIndex: (index: number) => void;
  formatCurrency: (value: number) => string;
}

interface Shape {
  id: string;
  type: 'pen' | 'eraser' | 't-account' | 'line' | 'text' | 'ledger' | 'journal-entry';
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  strokeWidth: number;
  text?: string;
  // Ledger fields
  accountNumber?: string;
  entries?: { debe: string, haber: string }[];
  finalBalance?: string;
  // Journal Entry fields
  journalRows?: { date: string, account: string, concept: string, debe: string, haber: string }[];
}

export const DigitalWhiteboard: React.FC<WhiteboardProps> = ({ 
  entries, 
  onClose, 
  pages, 
  setPages, 
  currentPageIndex, 
  setCurrentPageIndex,
  formatCurrency
}) => {
  const [tool, setTool] = useState<'select' | 'hand' | 'pen' | 'eraser' | 't-account' | 'journal-entry' | 'line' | 'text'>('pen');
  const [color, setColor] = useState('#10b981'); // Emerald-500
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [lastPenWidth, setLastPenWidth] = useState(3);
  const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [clipboard, setClipboard] = useState<Shape[]>([]);
  const isDrawing = useRef(false);
  const isSelecting = useRef(false);
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const journalRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight - 80 });
  const [isExporting, setIsExporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [textInput, setTextInput] = useState<{ x: number, y: number, relX: number, relY: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [editingJournalEntryId, setEditingJournalEntryId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const themeColors = {
    dark: {
      bg: '#09090b',
      toolbar: '#18181b',
      border: '#27272a',
      text: '#f4f4f5',
      grid: '#18181b'
    },
    light: {
      bg: '#ffffff',
      toolbar: '#f4f4f5',
      border: '#e4e4e7',
      text: '#18181b',
      grid: '#f4f4f5'
    }
  };

  const currentTheme = themeColors[theme];

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (tool === 'eraser') {
      setLastPenWidth(strokeWidth);
      setStrokeWidth(100);
    } else if (tool === 'pen' || tool === 't-account' || tool === 'line') {
      // Only restore if it was changed by the eraser logic
      if (strokeWidth === 100) {
        setStrokeWidth(lastPenWidth);
      }
    }
  }, [tool]);

  // Derive current page state with safety checks for old data format
  const rawPage = pages[currentPageIndex];
  const currentPage = (rawPage && !Array.isArray(rawPage)) 
    ? rawPage 
    : { shapes: Array.isArray(rawPage) ? rawPage : [], scale: 1, position: { x: 0, y: 0 } };
    
  const currentLines = currentPage.shapes || [];
  const scale = currentPage.scale || 1;
  const position = currentPage.position || { x: 0, y: 0 };

  const editingLedger = currentLines.find(s => s.id === editingLedgerId);
  const ledgerScreenPos = editingLedger ? {
    x: (editingLedger.x || 0) * scale + position.x,
    y: (editingLedger.y || 0) * scale + position.y
  } : null;

  const editingJournalEntry = currentLines.find(s => s.id === editingJournalEntryId);
  const journalEntryScreenPos = editingJournalEntry ? {
    x: (editingJournalEntry.x || 0) * scale + position.x,
    y: (editingJournalEntry.y || 0) * scale + position.y
  } : null;

  const formatAccountingNumber = (val: string) => {
    if (!val) return '';
    let s = val.toString().trim();
    
    // Extract numbers while preserving surrounding text (e.g. "S.d.=2000" -> "S.d.=", "2000")
    // This regex finds numbers with dots or commas
    const numRegex = /(-?\d[\d.,]*)/g;
    
    return s.replace(numRegex, (match) => {
      let cleanNum = match;
      
      // Normalize to US decimal for parsing
      if (cleanNum.includes(',') && cleanNum.includes('.')) {
        cleanNum = cleanNum.replace(/\./g, '').replace(',', '.');
      } else if (cleanNum.includes(',')) {
        cleanNum = cleanNum.replace(',', '.');
      } else if (cleanNum.includes('.')) {
        const parts = cleanNum.split('.');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
          cleanNum = cleanNum.replace(/\./g, '');
        }
      }
      
      const num = parseFloat(cleanNum);
      if (isNaN(num)) return match;
      
      // Format the number part
      const isNeg = num < 0;
      const absN = Math.abs(num);
      const p = absN.toFixed(2).split('.');
      p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      
      let res = (isNeg ? '-' : '') + p[0];
      if (absN % 1 !== 0) {
        let dec = p[1];
        if (dec.endsWith('0')) dec = dec.substring(0, 1);
        res += ',' + dec;
      }
      return res;
    });
  };

  const updateCurrentPage = (updates: Partial<WhiteboardPage>) => {
    const newPages = [...pages];
    newPages[currentPageIndex] = { ...currentPage, ...updates };
    setPages(newPages);
  };

  const addPage = () => {
    setPages([...pages, { shapes: [], scale: 1, position: { x: 0, y: 0 } }]);
    setCurrentPageIndex(pages.length);
  };

  const nextPage = () => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else {
      addPage();
    }
  };

  const prevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  useEffect(() => {
    if (tool !== 'select') {
      setSelectedIds([]);
    }
  }, [tool]);

  const generateId = () => `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0 && !textInput) {
          const newShapes = currentLines.filter(s => !selectedIds.includes(s.id));
          updateCurrentPage({ shapes: newShapes });
          setSelectedIds([]);
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedIds.length > 0) {
          const toCopy = currentLines.filter(s => selectedIds.includes(s.id));
          setClipboard(toCopy);
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard.length > 0) {
          const newShapes = clipboard.map(s => ({
            ...s,
            id: generateId(),
            x: (s.x || 0) + 20,
            y: (s.y || 0) + 20,
            points: s.points ? s.points.map((p, i) => p + 20) : undefined
          }));
          updateCurrentPage({ shapes: [...currentLines, ...newShapes] });
          setSelectedIds(newShapes.map(s => s.id));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(currentLines.map(s => s.id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, currentLines, clipboard, textInput]);

  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      const stage = stageRef.current;
      const nodes = selectedIds
        .filter(id => id && id.trim() !== '')
        .map(id => stage.findOne((node: any) => node.id() === id))
        .filter((node): node is any => 
          !!node && 
          node.nodeType !== 'Stage' && 
          node.nodeType !== 'Layer' &&
          node !== transformerRef.current &&
          !node.isAncestorOf(transformerRef.current)
        );
      transformerRef.current.nodes(nodes);
    }
  }, [selectedIds, currentLines]);

  const handleMouseDown = (e: any) => {
    const stage = stageRef.current;
    if (!stage) return;
    
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const transform = stage.getAbsoluteTransform().copy().invert();
    const relativePos = transform.point(pos);

    if (tool === 'select') {
      const clickedOnEmpty = e.target === stage || e.target.name() === 'background-rect';
      if (clickedOnEmpty) {
        setSelectedIds([]);
        isSelecting.current = true;
        setSelectionRect({ x1: relativePos.x, y1: relativePos.y, x2: relativePos.x, y2: relativePos.y });
      } else {
        // Clicked on a shape
        let shapeId = e.target.id();
        
        // If we clicked a child of a shape group, find the group
        if (!shapeId) {
          const shapeGroup = e.target.findAncestor('.shape');
          if (shapeGroup) {
            shapeId = shapeGroup.id();
          }
        }
        
        if (!shapeId) return;
        
        if (e.evt.shiftKey) {
          setSelectedIds(prev => prev.includes(shapeId) ? prev.filter(id => id !== shapeId) : [...prev, shapeId]);
        } else {
          if (!selectedIds.includes(shapeId)) {
            setSelectedIds([shapeId]);
          }
        }
      }
      return;
    }

    if (tool === 'hand') {
      return;
    }

    isDrawing.current = true;
    const id = generateId();

    if (tool === 'pen' || tool === 'eraser') {
      updateCurrentPage({
        shapes: [...currentLines, { 
          id, 
          type: tool, 
          points: [relativePos.x, relativePos.y], 
          color: tool === 'eraser' ? '#09090b' : color, 
          strokeWidth 
        }]
      });
    } else if (tool === 't-account') {
      updateCurrentPage({
        shapes: [...currentLines, { 
          id, 
          type: 't-account', 
          x: relativePos.x, 
          y: relativePos.y, 
          width: 240, 
          height: 120, 
          color, 
          strokeWidth: 2,
          accountNumber: '',
          entries: [{ debe: '', haber: '' }],
          finalBalance: ''
        }]
      });
      setEditingLedgerId(id);
      setTool('select');
    } else if (tool === 'journal-entry') {
      updateCurrentPage({
        shapes: [...currentLines, { 
          id, 
          type: 'journal-entry', 
          x: relativePos.x, 
          y: relativePos.y, 
          width: 600, 
          height: 100, 
          color, 
          strokeWidth: 2,
          journalRows: [{ date: '', account: '', concept: '', debe: '', haber: '' }]
        }]
      });
      setEditingJournalEntryId(id);
      setTool('select');
    } else if (tool === 'line') {
      updateCurrentPage({
        shapes: [...currentLines, { 
          id, 
          type: 'line', 
          points: [relativePos.x, relativePos.y, relativePos.x, relativePos.y], 
          color, 
          strokeWidth 
        }]
      });
    }
  };

  const handleContentClick = (e: any) => {
    if (tool !== 'text') return;
    
    const stage = stageRef.current;
    if (!stage) return;
    
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const transform = stage.getAbsoluteTransform().copy().invert();
    const relativePos = transform.point(pos);

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setTextInput({ 
        x: e.evt.clientX - containerRect.left, 
        y: e.evt.clientY - containerRect.top, 
        relX: relativePos.x, 
        relY: relativePos.y 
      });
      setTextValue('');
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const transform = stage.getAbsoluteTransform().copy().invert();
    const relativePos = transform.point(pos);

    // Update cursor position for eraser or text indicator
    if (tool === 'eraser' || tool === 'text') {
      setCursorPos(relativePos);
    } else {
      setCursorPos(null);
    }

    if (isSelecting.current && selectionRect) {
      setSelectionRect({ ...selectionRect, x2: relativePos.x, y2: relativePos.y });
      return;
    }

    if (!isDrawing.current || tool === 'select' || tool === 'hand') return;

    let lastShape = { ...currentLines[currentLines.length - 1] };

    if (tool === 'pen' || tool === 'eraser') {
      lastShape.points = lastShape.points!.concat([relativePos.x, relativePos.y]);
    } else if (tool === 't-account') {
      // Fixed size for functional T-account
    } else if (tool === 'line') {
      lastShape.points = [lastShape.points![0], lastShape.points![1], relativePos.x, relativePos.y];
    }

    const newLines = [...currentLines];
    newLines[newLines.length - 1] = lastShape;
    updateCurrentPage({ shapes: newLines });
  };

  const handleMouseUp = () => {
    if (isSelecting.current && selectionRect) {
      const x1 = Math.min(selectionRect.x1, selectionRect.x2);
      const y1 = Math.min(selectionRect.y1, selectionRect.y2);
      const x2 = Math.max(selectionRect.x1, selectionRect.x2);
      const y2 = Math.max(selectionRect.y1, selectionRect.y2);

      const stage = stageRef.current;
      const shapes = stage.find('.shape');
      const selected = shapes.filter((shape: any) => {
        const box = shape.getClientRect();
        return (
          box.x >= x1 &&
          box.y >= y1 &&
          box.x + box.width <= x2 &&
          box.y + box.height <= y2
        );
      });
      setSelectedIds(selected.map((s: any) => s.id()).filter(Boolean));
    }
    isDrawing.current = false;
    isSelecting.current = false;
    setSelectionRect(null);
  };

  const handleTransformEnd = (e: any) => {
    const node = e.target;
    const id = node.id();
    const shape = currentLines.find(s => s.id === id);
    if (!shape) return;

    const updates: Partial<Shape> = {};
    
    if (shape.type === 'text') {
      updates.x = node.x();
      updates.y = node.y();
      // Update font size (stored in strokeWidth for text)
      updates.strokeWidth = Math.max(5, shape.strokeWidth * node.scaleX());
      node.scaleX(1);
      node.scaleY(1);
    } else if (shape.type === 't-account') {
      updates.x = node.x();
      updates.y = node.y();
      updates.width = Math.max(10, node.width() * node.scaleX());
      updates.height = Math.max(10, node.height() * node.scaleY());
      node.scaleX(1);
      node.scaleY(1);
    } else if (shape.type === 'pen' || shape.type === 'eraser' || shape.type === 'line') {
      const transform = node.getTransform();
      const newPoints = [];
      for (let i = 0; i < shape.points!.length; i += 2) {
        const point = transform.point({ x: shape.points![i], y: shape.points![i+1] });
        newPoints.push(point.x, point.y);
      }
      updates.points = newPoints;
      node.x(0);
      node.y(0);
      node.scaleX(1);
      node.scaleY(1);
      node.rotation(0);
    }

    const newShapes = currentLines.map(s => s.id === id ? { ...s, ...updates } : s);
    updateCurrentPage({ shapes: newShapes });
  };

  const handleDragEnd = (e: any) => {
    const node = e.target;
    const id = node.id();
    const shape = currentLines.find(s => s.id === id);
    if (!shape) return;

    const updates: Partial<Shape> = {
      x: node.x(),
      y: node.y()
    };

    if (shape.type === 'pen' || shape.type === 'eraser' || shape.type === 'line') {
      // For lines, if we move them, we should update the points or keep x,y
      // Konva handles x,y for us, so we can just store them
    }

    const newShapes = currentLines.map(s => s.id === id ? { ...s, ...updates } : s);
    updateCurrentPage({ shapes: newShapes });
  };

  const handleDragMove = (e: any) => {
    const node = e.target;
    const id = node.id();
    
    // Update state during drag to keep floating editor and other UI in sync
    const newShapes = currentLines.map(s => s.id === id ? { ...s, x: node.x(), y: node.y() } : s);
    updateCurrentPage({ shapes: newShapes });
  };

  const handleTextSubmit = () => {
    if (textValue.trim() && textInput) {
      const id = generateId();
      const newShape: Shape = { 
        id, 
        type: 'text', 
        x: textInput.relX, 
        y: textInput.relY, 
        text: textValue, 
        color, 
        strokeWidth: 24 
      };
      
      updateCurrentPage({
        shapes: [...currentLines, newShape]
      });
    }
    setTextInput(null);
    setTextValue('');
  };

  const clearCanvas = () => {
    setShowClearConfirm(true);
  };

  const confirmClear = () => {
    if (currentPageIndex === 0) {
      // Page 1: Clear drawings but keep the page
      updateCurrentPage({ shapes: [] });
    } else {
      // Page 2+: Delete the page
      const newPages = pages.filter((_, i) => i !== currentPageIndex);
      setPages(newPages);
      // Adjust current page index if we deleted the last page
      if (currentPageIndex >= newPages.length) {
        setCurrentPageIndex(Math.max(0, newPages.length - 1));
      }
    }
    setShowClearConfirm(false);
  };

  const exportAllPages = async () => {
    if (isExporting) return;
    setIsExporting(true);
    
    const originalPageIndex = currentPageIndex;
    
    try {
      for (let i = 0; i < pages.length; i++) {
        setCurrentPageIndex(i);
        // Wait for React to render the page and Konva to update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (stageRef.current) {
          const stage = stageRef.current;
          const layer = stage.getLayers()[0];
          
          // 1. Get content bounds
          const konvaBox = layer.getClientRect({ skipTransform: false });
          
          // Convert to world coordinates
          const worldKonvaBox = {
            x: (konvaBox.x - stage.x()) / stage.scaleX(),
            y: (konvaBox.y - stage.y()) / stage.scaleY(),
            width: konvaBox.width / stage.scaleX(),
            height: konvaBox.height / stage.scaleY()
          };

          // Fallback if empty
          if (konvaBox.width <= 0 || konvaBox.height <= 0) {
            worldKonvaBox.x = 0;
            worldKonvaBox.y = 0;
            worldKonvaBox.width = dimensions.width;
            worldKonvaBox.height = dimensions.height;
          }

          let exportBox = { ...worldKonvaBox };
          let journalCanvas = null;

          // 2. Journal inclusion
          if (i === 0 && journalRef.current) {
            const journalEl = journalRef.current;
            const journalWidth = 1000;
            const journalHeight = journalEl.scrollHeight;
            const journalBox = { x: 10, y: 10, width: journalWidth, height: journalHeight };
            
            exportBox = {
              x: Math.min(worldKonvaBox.x, journalBox.x) - 50,
              y: Math.min(worldKonvaBox.y, journalBox.y) - 50,
              width: Math.max(worldKonvaBox.x + worldKonvaBox.width, journalBox.x + journalBox.width) - Math.min(worldKonvaBox.x, journalBox.x) + 100,
              height: Math.max(worldKonvaBox.y + worldKonvaBox.height, journalBox.y + journalBox.height) - Math.min(worldKonvaBox.y, journalBox.y) + 100
            };

            try {
              journalCanvas = await html2canvas(journalEl, {
                backgroundColor: '#18181b',
                scale: 4, // Increase scale for sharper text
                useCORS: true,
                logging: false,
                width: journalWidth,
                height: journalHeight,
                onclone: (clonedDoc) => {
                  const el = clonedDoc.getElementById('journal-overlay');
                  if (el) {
                    el.style.transform = 'none';
                    el.style.position = 'static';
                    el.style.width = '1000px';
                    el.style.opacity = '1';
                  }
                }
              });
            } catch (e) {
              console.error("Journal capture failed", e);
            }
          } else {
            // Add padding to drawings-only pages
            exportBox.x -= 50;
            exportBox.y -= 50;
            exportBox.width += 100;
            exportBox.height += 100;
          }

          // Cap dimensions to avoid browser crashes (max 8000px)
          const MAX_DIM = 8000;
          // finalScale is the visual scale (zoom)
          let finalScale = scale;
          
          // We want 4x pixel density for ultra-high resolution
          const pixelRatio = 4;

          if (exportBox.width * finalScale * pixelRatio > MAX_DIM) {
            finalScale = (MAX_DIM / pixelRatio) / exportBox.width;
          }
          if (exportBox.height * finalScale * pixelRatio > MAX_DIM) {
            finalScale = Math.min(finalScale, (MAX_DIM / pixelRatio) / exportBox.height);
          }

          // Ensure positive dimensions
          exportBox.width = Math.max(1, exportBox.width);
          exportBox.height = Math.max(1, exportBox.height);

          const konvaDataURL = stage.toDataURL({
            x: exportBox.x * stage.scaleX() + stage.x(),
            y: exportBox.y * stage.scaleY() + stage.y(),
            width: exportBox.width * stage.scaleX(),
            height: exportBox.height * stage.scaleY(),
            pixelRatio: (finalScale * pixelRatio) / stage.scaleX()
          });

          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = exportBox.width * finalScale * pixelRatio;
          finalCanvas.height = exportBox.height * finalScale * pixelRatio;
          const ctx = finalCanvas.getContext('2d');
          
          if (ctx) {
            // Disable image smoothing for sharper lines
            ctx.imageSmoothingEnabled = false;
            
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
            
            if (journalCanvas) {
              const jX = (10 - exportBox.x) * finalScale * pixelRatio;
              const jY = (10 - exportBox.y) * finalScale * pixelRatio;
              // Scale journal to match the final export scale (journalCanvas was captured at 4x)
              ctx.drawImage(journalCanvas, jX, jY, journalCanvas.width * (finalScale * pixelRatio / 4), journalCanvas.height * (finalScale * pixelRatio / 4));
            }
            
            const konvaImg = new Image();
            await new Promise((resolve, reject) => {
              konvaImg.onload = resolve;
              konvaImg.onerror = reject;
              konvaImg.src = konvaDataURL;
            });
            ctx.drawImage(konvaImg, 0, 0);
            
            await new Promise<void>((resolve) => {
              finalCanvas.toBlob((blob) => {
                if (blob) {
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.download = `pizarra-pagina-${i + 1}.jpg`;
                  link.href = url;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  setTimeout(() => {
                    URL.revokeObjectURL(url);
                    resolve();
                  }, 100);
                } else {
                  resolve();
                }
              }, 'image/jpeg', 0.95); // Increase quality to 0.95
            });
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error("Export error:", error);
      alert("Hubo un error al exportar. Por favor, intenta de nuevo.");
    } finally {
      setCurrentPageIndex(originalPageIndex);
      setIsExporting(false);
    }
  };

  const handleZoomIn = () => {
    const newScale = Math.min(scale + 0.1, 3);
    updateCurrentPage({ scale: newScale });
  };
  
  const handleZoomOut = () => {
    const newScale = Math.max(scale - 0.1, 0.5);
    updateCurrentPage({ scale: newScale });
  };

  const resetZoom = () => {
    updateCurrentPage({ scale: 1, position: { x: 0, y: 0 } });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col">
      {/* Toolbar */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex bg-zinc-800 p-1 rounded-xl border border-zinc-700 mr-4">
            <ToolButton active={tool === 'select'} onClick={() => setTool('select')} icon={<MousePointer2 className="w-4 h-4" />} title="Seleccionar" />
            <ToolButton active={tool === 'hand'} onClick={() => setTool('hand')} icon={<Hand className="w-4 h-4" />} title="Mano (Desplazar)" />
            <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} icon={<Pencil className="w-4 h-4" />} title="Lápiz" />
            <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<Eraser className="w-4 h-4" />} title="Borrador" />
            <ToolButton active={tool === 't-account'} onClick={() => setTool('t-account')} icon={<Columns2 className="w-4 h-4" />} title="Libro Mayor" />
            <ToolButton active={tool === 'journal-entry'} onClick={() => setTool('journal-entry')} icon={<BookOpen className="w-4 h-4" />} title="Asiento" />
            <ToolButton active={tool === 'line'} onClick={() => setTool('line')} icon={<Minus className="w-4 h-4" />} title="Línea" />
            <ToolButton active={tool === 'text'} onClick={() => setTool('text')} icon={<Type className="w-4 h-4" />} title="Texto" />
          </div>

          {tool === 'select' && selectedIds.length > 0 && (
            <div className="flex bg-zinc-800 p-1 rounded-xl border border-zinc-700 mr-4 animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => {
                  const toCopy = currentLines.filter(s => selectedIds.includes(s.id));
                  setClipboard(toCopy);
                }}
                className="p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
                title="Copiar (Ctrl+C)"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  const newShapes = currentLines.filter(s => !selectedIds.includes(s.id));
                  updateCurrentPage({ shapes: newShapes });
                  setSelectedIds([]);
                }}
                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                title="Eliminar (Supr)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 bg-zinc-800 p-1 rounded-xl border border-zinc-700 px-3">
            <Palette className="w-4 h-4 text-zinc-500" />
            <div className="flex gap-1.5">
              {['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#ffffff', '#000000'].map(c => (
                <button 
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 bg-zinc-800 p-1 rounded-xl border border-zinc-700 px-3 ml-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Grosor</span>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={strokeWidth} 
              onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
              className="w-20 accent-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700 ml-4">
            <button onClick={handleZoomOut} className="p-1.5 text-zinc-400 hover:text-white transition-colors" title="Alejar">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={resetZoom} className="text-[10px] font-bold text-zinc-300 min-w-[3rem] text-center hover:text-emerald-500 transition-colors">
              {Math.round(scale * 100)}%
            </button>
            <button onClick={handleZoomIn} className="p-1.5 text-zinc-400 hover:text-white transition-colors" title="Acercar">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700 ml-4">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
              className={`p-1.5 rounded-lg transition-all ${theme === 'light' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-white'}`}
              title="Cambiar tema"
            >
              <Palette className="w-4 h-4" />
            </button>
          </div>

          {/* Page Navigation */}
          <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700 ml-4">
            <button 
              onClick={prevPage}
              disabled={currentPageIndex === 0}
              className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-20 transition-colors"
              title="Página anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-[11px] font-bold text-zinc-300 min-w-[3rem] text-center">
              {currentPageIndex + 1} / {pages.length}
            </span>
            <button 
              onClick={nextPage}
              className="p-1.5 text-zinc-400 hover:text-white transition-colors"
              title={currentPageIndex < pages.length - 1 ? "Página siguiente" : "Añadir página"}
            >
              {currentPageIndex < pages.length - 1 ? <ChevronRight className="w-5 h-5" /> : <PlusCircle className="w-5 h-5 text-emerald-500" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={clearCanvas}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-red-900/30 text-zinc-400 hover:text-red-400 rounded-xl transition-all border border-zinc-700"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-bold">Limpiar</span>
          </button>
          <button 
            onClick={exportAllPages}
            disabled={isExporting}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-lg ${isExporting ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'}`}
          >
            <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
            <span className="text-sm font-bold">{isExporting ? 'Exportando...' : 'Exportar'}</span>
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        className="flex-grow relative overflow-hidden" 
        id="whiteboard-container" 
        ref={containerRef}
        style={{ backgroundColor: currentTheme.bg }} 
      >
        {/* Journal Overlay (Only on first page) - MATCHING EXACTLY THE APP.TSX STYLE */}
        {currentPageIndex === 0 && (
          <div 
            id="journal-overlay"
            ref={journalRef}
            className="absolute top-10 left-10 z-10 w-[1000px] rounded-2xl border shadow-2xl overflow-hidden pointer-events-none opacity-95"
            style={{ 
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff',
              borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7'
            }}
          >
            <div 
              className="p-4 border-b flex items-center gap-3"
              style={{ 
                backgroundColor: theme === 'dark' ? 'rgba(39, 39, 42, 0.5)' : 'rgba(244, 244, 245, 0.5)',
                borderBottomColor: theme === 'dark' ? '#27272a' : '#e4e4e7'
              }}
            >
              <BookOpen className="w-5 h-5" style={{ color: theme === 'dark' ? '#10b981' : '#065f46' }} />
              <span className="text-lg font-bold" style={{ color: theme === 'dark' ? '#f4f4f5' : '#18181b' }}>Libro Diario</span>
            </div>
            <div className="p-6 space-y-6" style={{ fontSize: '160%', color: theme === 'dark' ? '#f4f4f5' : '#18181b' }}>
              <div className="space-y-4 font-mono">
                {entries.map((asiento, aIdx) => (
                  <div key={aIdx} className={aIdx > 0 ? "pt-4" : ""} style={{ borderTop: aIdx > 0 ? `1px solid ${theme === 'dark' ? '#27272a' : '#e4e4e7'}` : 'none' }}>
                    <div className="mb-2 px-2 flex flex-col">
                      <span className="text-[0.7em]" style={{ color: '#71717a' }}>Asiento #{aIdx + 1}</span>
                      <span className="text-[0.7em] font-bold" style={{ color: theme === 'dark' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(6, 95, 70, 0.9)' }}>{asiento[0]?.date || 'xx/xx/xx'}</span>
                    </div>
                    {asiento.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-4 py-1 px-2">
                        <div 
                          className={`col-span-6 ${row.haber > 0 ? 'pl-4' : 'font-bold'}`}
                          style={{ color: row.haber > 0 ? (theme === 'dark' ? '#a1a1aa' : '#71717a') : (theme === 'dark' ? '#34d399' : '#059669') }}
                        >
                          {row.haber > 0 ? 'a ' : ''}
                          {row.code && <span className="text-[0.8em] opacity-80 mr-4 font-black" style={{ color: theme === 'dark' ? '#10b981' : '#065f46' }}>{row.code}</span>}
                          {row.account}
                        </div>
                        <div className="col-span-3 text-right" style={{ color: theme === 'dark' ? '#d4d4d8' : '#3f3f46' }}>
                          {row.debe > 0 ? formatCurrency(row.debe) : '-'}
                        </div>
                        <div className="col-span-3 text-right" style={{ color: theme === 'dark' ? '#d4d4d8' : '#3f3f46' }}>
                          {row.haber > 0 ? formatCurrency(row.haber) : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {entries.length === 0 && (
                  <p className="text-[0.8em] italic text-center py-4" style={{ color: '#52525b' }}>No hay asientos registrados aún</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="absolute inset-0 z-20">
          <Stage
            width={dimensions.width}
            height={dimensions.height}
            scaleX={scale}
            scaleY={scale}
            x={position.x}
            y={position.y}
            draggable={tool === 'hand'}
            onDragMove={(e) => {
              if (e.target === e.currentTarget) {
                updateCurrentPage({ position: { x: e.target.x(), y: e.target.y() } });
              }
            }}
            onDragEnd={(e) => {
              if (e.target === e.currentTarget) {
                updateCurrentPage({ position: { x: e.target.x(), y: e.target.y() } });
              }
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleContentClick}
            ref={stageRef}
            listening={true}
            className={`${tool === 'hand' ? 'cursor-grab active:cursor-grabbing' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
            style={{ backgroundColor: 'transparent' }}
          >
            <Layer>
              {/* Background Rect to capture clicks reliably */}
              <Rect
                width={dimensions.width * 10}
                height={dimensions.height * 10}
                x={-dimensions.width * 5}
                y={-dimensions.height * 5}
                fill="transparent"
                listening={true}
                name="background-rect"
              />
              
              {/* Background Grid - Removed from all pages as requested */}
              {/* {currentPageIndex !== 0 && <Grid width={dimensions.width} height={dimensions.height} />} */}
              
              {currentLines.map((shape, i) => {
                const isSelected = selectedIds.includes(shape.id);
                const commonProps = {
                  id: shape.id,
                  name: 'shape',
                  draggable: tool === 'select',
                  onDragMove: handleDragMove,
                  onDragEnd: handleDragEnd,
                  onTransformEnd: handleTransformEnd,
                  onClick: (e: any) => {
                    if (tool === 'select') {
                      e.cancelBubble = true;
                      if (e.evt.shiftKey) {
                        setSelectedIds(prev => prev.includes(shape.id) ? prev.filter(id => id !== shape.id) : [...prev, shape.id]);
                      } else {
                        setSelectedIds([shape.id]);
                      }
                    }
                  }
                };

                if (shape.type === 'pen' || shape.type === 'eraser') {
                  return (
                    <Line
                      key={shape.id}
                      {...commonProps}
                      points={shape.points}
                      x={shape.x || 0}
                      y={shape.y || 0}
                      stroke={shape.color}
                      strokeWidth={shape.strokeWidth}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={
                        shape.type === 'eraser' ? 'destination-out' : 'source-over'
                      }
                    />
                  );
                } else if (shape.type === 't-account') {
                  const entries = shape.entries || [];
                  const rowHeight = 30;
                  const width = shape.width || 240;
                  const baseColor = shape.color;
                  // Adjust color for light theme if it's too bright (like white)
                  const color = theme === 'light' && (baseColor === '#ffffff' || baseColor === 'white') ? '#18181b' : baseColor;
                  const isEditing = editingLedgerId === shape.id;
                  
                  return (
                    <Group 
                      key={shape.id}
                      {...commonProps}
                      x={shape.x || 0}
                      y={shape.y || 0}
                      onClick={(e) => {
                        if (tool === 'select') {
                          e.cancelBubble = true;
                          setSelectedIds([shape.id]);
                          setEditingLedgerId(shape.id);
                        }
                      }}
                    >
                      {/* Account Number - Hide if editing to avoid double text */}
                      {!isEditing && (
                        <Text
                          text={shape.accountNumber || 'Nº Cuenta'}
                          width={width}
                          align="center"
                          y={-30}
                          fontSize={20}
                          fill={color}
                          fontStyle="bold"
                        />
                      )}
                      
                      {/* T-Shape - Classic structure */}
                      <Line
                        points={[0, 0, width, 0]}
                        stroke={color}
                        strokeWidth={3}
                      />
                      <Line
                        points={[width / 2, 0, width / 2, 20 + entries.length * rowHeight]}
                        stroke={color}
                        strokeWidth={3}
                      />
                      
                      {/* Entries */}
                      {entries.map((entry, idx) => (
                        <React.Fragment key={idx}>
                          {entry.debe && (
                            <Text
                              text={formatAccountingNumber(entry.debe)}
                              x={10}
                              y={10 + idx * rowHeight}
                              fontSize={16}
                              fill={color}
                              fontStyle="bold"
                            />
                          )}
                          {entry.haber && (
                            <Text
                              text={formatAccountingNumber(entry.haber)}
                              x={width / 2 + 10}
                              y={10 + idx * rowHeight}
                              fontSize={16}
                              fill={color}
                              fontStyle="bold"
                              width={width / 2 - 20}
                              align="right"
                            />
                          )}
                        </React.Fragment>
                      ))}
                      
                      {/* Final Balance */}
                      {!isEditing && (
                        <Text
                          text={formatAccountingNumber(shape.finalBalance || '')}
                          width={width}
                          align="center"
                          y={30 + entries.length * rowHeight}
                          fontSize={18}
                          fill={color}
                          fontStyle="bold italic"
                        />
                      )}
                    </Group>
                  );
                } else if (shape.type === 'journal-entry') {
                  const rows = shape.journalRows || [];
                  const rowHeight = 30;
                  const width = shape.width || 600;
                  const baseColor = shape.color;
                  const color = theme === 'light' && (baseColor === '#ffffff' || baseColor === 'white') ? '#18181b' : baseColor;
                  const isEditing = editingJournalEntryId === shape.id;
                  const colWidths = [80, 100, 220, 100, 100];
                  const headers = ['Fecha', 'Cuenta', 'Concepto', 'Debe', 'Haber'];

                  return (
                    <Group
                      key={shape.id}
                      {...commonProps}
                      x={shape.x || 0}
                      y={shape.y || 0}
                      onClick={(e) => {
                        if (tool === 'select') {
                          e.cancelBubble = true;
                          setSelectedIds([shape.id]);
                          setEditingJournalEntryId(shape.id);
                        }
                      }}
                    >
                      {/* Headers */}
                      <Rect width={width} height={rowHeight} fill={theme === 'dark' ? '#27272a' : '#f4f4f5'} cornerRadius={4} />
                      {headers.map((h, idx) => {
                        let xOffset = 0;
                        for (let j = 0; j < idx; j++) xOffset += colWidths[j];
                        return (
                          <Text
                            key={idx}
                            text={h}
                            x={xOffset + 5}
                            y={8}
                            fontSize={14}
                            fontStyle="bold"
                            fill={theme === 'dark' ? '#a1a1aa' : '#71717a'}
                            width={colWidths[idx] - 10}
                            align={idx >= 3 ? 'right' : 'left'}
                          />
                        );
                      })}

                      {/* Rows */}
                      {!isEditing && rows.map((row, rIdx) => (
                        <Group key={rIdx} y={(rIdx + 1) * rowHeight}>
                          <Line points={[0, 0, width, 0]} stroke={theme === 'dark' ? '#27272a' : '#e4e4e7'} strokeWidth={1} />
                          {[row.date, row.account, row.concept, row.debe, row.haber].map((val, cIdx) => {
                            let xOffset = 0;
                            for (let j = 0; j < cIdx; j++) xOffset += colWidths[j];
                            return (
                              <Text
                                key={cIdx}
                                text={cIdx >= 3 ? formatAccountingNumber(val) : val}
                                x={xOffset + 5}
                                y={8}
                                fontSize={14}
                                fill={color}
                                width={colWidths[cIdx] - 10}
                                align={cIdx >= 3 ? 'right' : 'left'}
                              />
                            );
                          })}
                        </Group>
                      ))}
                      
                      {/* Border */}
                      <Rect 
                        width={width} 
                        height={(rows.length + 1) * rowHeight} 
                        stroke={color} 
                        strokeWidth={isSelected ? 2 : 1} 
                        opacity={isSelected ? 1 : 0.3}
                        cornerRadius={4}
                      />
                    </Group>
                  );
                } else if (shape.type === 'line') {
                  return (
                    <Line
                      key={shape.id}
                      {...commonProps}
                      points={shape.points}
                      x={shape.x || 0}
                      y={shape.y || 0}
                      stroke={shape.color}
                      strokeWidth={shape.strokeWidth}
                    />
                  );
                } else if (shape.type === 'text') {
                  return (
                    <Text
                      key={shape.id}
                      {...commonProps}
                      x={shape.x}
                      y={shape.y}
                      text={shape.text}
                      fill={shape.color}
                      fontSize={shape.strokeWidth}
                    />
                  );
                }
                return null;
              })}

              {/* Selection Marquee */}
              {selectionRect && (
                <Rect
                  x={Math.min(selectionRect.x1, selectionRect.x2)}
                  y={Math.min(selectionRect.y1, selectionRect.y2)}
                  width={Math.abs(selectionRect.x2 - selectionRect.x1)}
                  height={Math.abs(selectionRect.y2 - selectionRect.y1)}
                  fill="rgba(16, 185, 129, 0.1)"
                  stroke="#10b981"
                  strokeWidth={1}
                  dash={[5, 5]}
                />
              )}

              {/* Transformer */}
              {tool === 'select' && (
                <Transformer
                  ref={transformerRef}
                  boundBoxFunc={(oldBox, newBox) => {
                    // limit resize
                    if (newBox.width < 5 || newBox.height < 5) {
                      return oldBox;
                    }
                    return newBox;
                  }}
                />
              )}

              {/* Eraser Indicator */}
              {tool === 'eraser' && cursorPos && (
                <Circle
                  x={cursorPos.x}
                  y={cursorPos.y}
                  radius={strokeWidth / 2}
                  stroke="#ef4444"
                  strokeWidth={1 / scale}
                  dash={[5, 5]}
                />
              )}

              {/* Text Tool Indicator */}
              {tool === 'text' && cursorPos && !textInput && (
                <Rect
                  x={cursorPos.x}
                  y={cursorPos.y - 12}
                  width={2}
                  height={24}
                  fill={color}
                  opacity={0.6}
                />
              )}
            </Layer>
          </Stage>
        </div>

        {/* Floating Selection Toolbar */}
        {selectedIds.length > 0 && tool === 'select' && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4">
            <span className="text-xs font-bold text-zinc-500 mr-2">{selectedIds.length} seleccionados</span>
            <div className="w-px h-4 bg-zinc-800 mx-1" />
            <button 
              onClick={() => {
                const toCopy = currentLines.filter(s => selectedIds.includes(s.id));
                setClipboard(toCopy);
              }}
              className="p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
              title="Copiar (Ctrl+C)"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                if (clipboard.length > 0) {
                  const newShapes = clipboard.map(s => ({
                    ...s,
                    id: generateId(),
                    x: (s.x || 0) + 20,
                    y: (s.y || 0) + 20,
                    points: s.points ? s.points.map((p, i) => p + 20) : undefined
                  }));
                  updateCurrentPage({ shapes: [...currentLines, ...newShapes] });
                  setSelectedIds(newShapes.map(s => s.id));
                }
              }}
              className={`p-2 rounded-lg transition-all ${clipboard.length > 0 ? 'text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10' : 'text-zinc-700 cursor-not-allowed'}`}
              title="Pegar (Ctrl+V)"
              disabled={clipboard.length === 0}
            >
              <PlusCircle className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-1" />
            <button 
              onClick={() => {
                const newShapes = currentLines.filter(s => !selectedIds.includes(s.id));
                updateCurrentPage({ shapes: newShapes });
                setSelectedIds([]);
              }}
              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
              title="Eliminar (Supr)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Inline Text Input - MOVED AFTER STAGE TO ENSURE Z-INDEX DOMINANCE */}
        {textInput && (
          <div 
            className="absolute z-[1000] p-1 bg-zinc-900 border-2 border-dashed border-emerald-500 rounded-lg shadow-2xl ring-4 ring-emerald-500/20"
            style={{ 
              left: textInput.x, 
              top: textInput.y,
              transform: 'translate(-10px, -50%)'
            }}
          >
            <input
              autoFocus
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={() => {
                if (textValue.trim()) handleTextSubmit();
                else setTextInput(null);
              }}
              className="bg-transparent text-white border-none px-4 py-2 outline-none min-w-[300px] text-xl font-bold"
              style={{ color: color }}
              placeholder="Escribe aquí..."
            />
          </div>
        )}

        {/* Ledger Editor Overlay */}
        {editingLedgerId && editingLedger && ledgerScreenPos && (
          <div 
            className="absolute z-[1000] p-4 bg-zinc-900 border-2 border-emerald-500 rounded-2xl shadow-2xl"
            style={{ 
              left: ledgerScreenPos.x, 
              top: ledgerScreenPos.y,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              width: editingLedger.width || 240
            }}
          >
            <input
              autoFocus
              type="text"
              value={editingLedger.accountNumber || ''}
              onChange={(e) => {
                const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, accountNumber: e.target.value } : s);
                updateCurrentPage({ shapes: newShapes });
              }}
              className="w-full bg-transparent text-center text-white border-b border-zinc-700 pb-1 mb-4 outline-none font-bold"
              placeholder="Nº Cuenta"
            />
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 pr-1">
              {editingLedger.entries?.map((entry, idx) => {
                const isLast = idx === editingLedger.entries!.length - 1;
                const showDebe = isLast || entry.debe !== '';
                const showHaber = isLast || entry.haber !== '';

                return (
                  <div key={idx} className="flex gap-2 min-h-[32px]">
                    {showDebe ? (
                      <input
                        type="text"
                        value={entry.debe}
                        onChange={(e) => {
                          const newEntries = [...(editingLedger.entries || [])];
                          newEntries[idx] = { ...newEntries[idx], debe: e.target.value };
                          const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, entries: newEntries } : s);
                          updateCurrentPage({ shapes: newShapes });
                        }}
                        onBlur={(e) => {
                          const formatted = formatAccountingNumber(e.target.value);
                          const newEntries = [...(editingLedger.entries || [])];
                          newEntries[idx] = { ...newEntries[idx], debe: formatted };
                          const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, entries: newEntries } : s);
                          updateCurrentPage({ shapes: newShapes });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const formatted = formatAccountingNumber((e.target as HTMLInputElement).value);
                            const newEntries = [...(editingLedger.entries || [])];
                            newEntries[idx] = { ...newEntries[idx], debe: formatted };
                            newEntries.push({ debe: '', haber: '' });
                            const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, entries: newEntries } : s);
                            updateCurrentPage({ shapes: newShapes });
                          }
                        }}
                        className="w-1/2 bg-zinc-800 text-white p-1 rounded outline-none text-sm font-bold"
                        placeholder="..."
                      />
                    ) : <div className="w-1/2" />}
                    
                    {showHaber ? (
                      <input
                        type="text"
                        value={entry.haber}
                        onChange={(e) => {
                          const newEntries = [...(editingLedger.entries || [])];
                          newEntries[idx] = { ...newEntries[idx], haber: e.target.value };
                          const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, entries: newEntries } : s);
                          updateCurrentPage({ shapes: newShapes });
                        }}
                        onBlur={(e) => {
                          const formatted = formatAccountingNumber(e.target.value);
                          const newEntries = [...(editingLedger.entries || [])];
                          newEntries[idx] = { ...newEntries[idx], haber: formatted };
                          const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, entries: newEntries } : s);
                          updateCurrentPage({ shapes: newShapes });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const formatted = formatAccountingNumber((e.target as HTMLInputElement).value);
                            const newEntries = [...(editingLedger.entries || [])];
                            newEntries[idx] = { ...newEntries[idx], haber: formatted };
                            newEntries.push({ debe: '', haber: '' });
                            const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, entries: newEntries } : s);
                            updateCurrentPage({ shapes: newShapes });
                          }
                        }}
                        className="w-1/2 bg-zinc-800 text-white p-1 rounded outline-none text-sm font-bold text-right"
                        placeholder="..."
                      />
                    ) : <div className="w-1/2" />}
                  </div>
                );
              })}
            </div>
            
            <input
              type="text"
              value={editingLedger.finalBalance || ''}
              onChange={(e) => {
                const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, finalBalance: e.target.value } : s);
                updateCurrentPage({ shapes: newShapes });
              }}
              onBlur={(e) => {
                const formatted = formatAccountingNumber(e.target.value);
                const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, finalBalance: formatted } : s);
                updateCurrentPage({ shapes: newShapes });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const formatted = formatAccountingNumber((e.target as HTMLInputElement).value);
                  const newShapes = currentLines.map(s => s.id === editingLedgerId ? { ...s, finalBalance: formatted } : s);
                  updateCurrentPage({ shapes: newShapes });
                  setEditingLedgerId(null);
                }
              }}
              className="w-full bg-transparent text-center text-white border-t border-zinc-700 pt-1 mt-4 outline-none font-bold italic"
              placeholder="Saldo final"
            />
            
            <button 
              onClick={() => setEditingLedgerId(null)}
              className="absolute -top-3 -right-3 w-7 h-7 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Journal Entry Editor Overlay */}
        {editingJournalEntryId && editingJournalEntry && journalEntryScreenPos && (
          <div 
            className="absolute z-[1000] p-4 bg-zinc-900 border-2 border-emerald-500 rounded-2xl shadow-2xl"
            style={{ 
              left: journalEntryScreenPos.x, 
              top: journalEntryScreenPos.y,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              width: 700
            }}
          >
            <div className="grid grid-cols-[80px_100px_220px_100px_100px] gap-2 mb-2 px-1">
              {['Fecha', 'Cuenta', 'Concepto', 'Debe', 'Haber'].map(h => (
                <span key={h} className="text-[10px] font-bold text-zinc-500 uppercase">{h}</span>
              ))}
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 pr-1">
              {editingJournalEntry.journalRows?.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[80px_100px_220px_100px_100px] gap-2">
                  <input
                    type="text"
                    value={row.date}
                    onChange={(e) => {
                      const newRows = [...(editingJournalEntry.journalRows || [])];
                      newRows[idx] = { ...newRows[idx], date: e.target.value };
                      const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                      updateCurrentPage({ shapes: newShapes });
                    }}
                    className="bg-zinc-800 text-white p-1.5 rounded outline-none text-xs"
                    placeholder="DD/MM"
                  />
                  <input
                    type="text"
                    value={row.account}
                    onChange={(e) => {
                      const newRows = [...(editingJournalEntry.journalRows || [])];
                      newRows[idx] = { ...newRows[idx], account: e.target.value };
                      const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                      updateCurrentPage({ shapes: newShapes });
                    }}
                    className="bg-zinc-800 text-white p-1.5 rounded outline-none text-xs"
                    placeholder="Código"
                  />
                  <input
                    type="text"
                    value={row.concept}
                    onChange={(e) => {
                      const newRows = [...(editingJournalEntry.journalRows || [])];
                      newRows[idx] = { ...newRows[idx], concept: e.target.value };
                      const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                      updateCurrentPage({ shapes: newShapes });
                    }}
                    className="bg-zinc-800 text-white p-1.5 rounded outline-none text-xs"
                    placeholder="Concepto..."
                  />
                  <input
                    type="text"
                    value={row.debe}
                    onChange={(e) => {
                      const newRows = [...(editingJournalEntry.journalRows || [])];
                      newRows[idx] = { ...newRows[idx], debe: e.target.value };
                      const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                      updateCurrentPage({ shapes: newShapes });
                    }}
                    onBlur={(e) => {
                      const formatted = formatAccountingNumber(e.target.value);
                      const newRows = [...(editingJournalEntry.journalRows || [])];
                      newRows[idx] = { ...newRows[idx], debe: formatted };
                      const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                      updateCurrentPage({ shapes: newShapes });
                    }}
                    className="bg-zinc-800 text-white p-1.5 rounded outline-none text-xs text-right"
                    placeholder="0,00"
                  />
                  <input
                    type="text"
                    value={row.haber}
                    onChange={(e) => {
                      const newRows = [...(editingJournalEntry.journalRows || [])];
                      newRows[idx] = { ...newRows[idx], haber: e.target.value };
                      const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                      updateCurrentPage({ shapes: newShapes });
                    }}
                    onBlur={(e) => {
                      const formatted = formatAccountingNumber(e.target.value);
                      const newRows = [...(editingJournalEntry.journalRows || [])];
                      newRows[idx] = { ...newRows[idx], haber: formatted };
                      const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                      updateCurrentPage({ shapes: newShapes });
                    }}
                    className="bg-zinc-800 text-white p-1.5 rounded outline-none text-xs text-right"
                    placeholder="0,00"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
              <button
                onClick={() => {
                  const newRows = [...(editingJournalEntry.journalRows || [])];
                  newRows.push({ date: '', account: '', concept: '', debe: '', haber: '' });
                  const newShapes = currentLines.map(s => s.id === editingJournalEntryId ? { ...s, journalRows: newRows } : s);
                  updateCurrentPage({ shapes: newShapes });
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Añadir fila
              </button>
              
              <button
                onClick={() => setEditingJournalEntryId(null)}
                className="px-6 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all"
              >
                Finalizar
              </button>
            </div>
            
            <button 
              onClick={() => setEditingJournalEntryId(null)}
              className="absolute -top-3 -right-3 w-7 h-7 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Confirmation Modal */}
        {showClearConfirm && (
          <div className="absolute inset-0 z-[500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-2">
                {currentPageIndex === 0 ? '¿Limpiar dibujos?' : '¿Eliminar página?'}
              </h3>
              <p className="text-zinc-400 text-center mb-8">
                {currentPageIndex === 0 
                  ? 'Se borrarán todos los trazos sobre el Libro Diario. Esta acción no se puede deshacer.'
                  : 'Esta página y todos sus dibujos se eliminarán permanentemente.'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmClear}
                  className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-900/20"
                >
                  {currentPageIndex === 0 ? 'Limpiar' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ToolButton = ({ active, onClick, icon, title }: { active: boolean, onClick: () => void, icon: React.ReactNode, title: string }) => (
  <button 
    onClick={onClick}
    className={`p-2 rounded-lg transition-all ${active ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
    title={title}
  >
    {icon}
  </button>
);

const Grid = ({ width, height }: { width: number, height: number }) => {
  const lines = [];
  const step = 40;

  for (let i = 0; i < width / step; i++) {
    lines.push(
      <Line
        key={`v-${i}`}
        points={[i * step, 0, i * step, height]}
        stroke="#18181b"
        strokeWidth={1}
      />
    );
  }
  for (let i = 0; i < height / step; i++) {
    lines.push(
      <Line
        key={`h-${i}`}
        points={[0, i * step, width, i * step]}
        stroke="#18181b"
        strokeWidth={1}
      />
    );
  }

  return <>{lines}</>;
};
