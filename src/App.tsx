import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import { FileText, CloudUpload, Settings, X, Loader2, Image, ChevronLeft, Trash2 } from 'lucide-react'
import { analyzePDF, PageAnalysis, ColorCategory } from './pdfAnalyzer'

type Pricing = {
  bw: number;
  low: number;
  medium: number;
  high: number;
};

const DEFAULT_PRICING: Pricing = {
  bw: 500,
  low: 1000,
  medium: 1500,
  high: 2000
};

type FileRow = { 
  id: string; 
  name: string; 
  size: string; 
  pages: number; 
  bwPages: number;
  lowColorPages: number;
  mediumColorPages: number;
  highColorPages: number;
  type: string; 
  details?: PageAnalysis[]; 
  isAnalyzing?: boolean; 
  file?: File;
  error?: string;
}

function formatBytes(bytes: number) { 
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` 
}

function formatRupiah(number: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

export default function App() {
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileRow[]>([]); 
  const [drag, setDrag] = useState(false); 
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('swiftprint_pricing');
    if (saved) {
      try { setPricing(JSON.parse(saved)); } catch(e) {}
    }
  }, []);

  const savePricing = (newPricing: Pricing) => {
    setPricing(newPricing);
    localStorage.setItem('swiftprint_pricing', JSON.stringify(newPricing));
    setShowSettings(false);
  };

  const calculatePrice = (f: FileRow) => {
    return (f.bwPages * pricing.bw) + (f.lowColorPages * pricing.low) + (f.mediumColorPages * pricing.medium) + (f.highColorPages * pricing.high);
  };

  const addFiles = async (list: FileList | null) => { 
    if (!list?.length) return; 
    
    const newFiles = Array.from(list).map(f => {
      const ext = f.name.split('.').pop()?.toUpperCase() || '';
      return { 
        id: Math.random().toString(36).substring(7),
        name: f.name,
        size: formatBytes(f.size),
        pages: 0, bwPages: 0, lowColorPages: 0, mediumColorPages: 0, highColorPages: 0,
        type: ext,
        file: f,
        isAnalyzing: ext === 'PDF',
        error: ['DOCX', 'DOC', 'XLSX', 'XLS'].includes(ext) 
          ? 'File Word/Excel tidak bisa dianalisa akurat di browser. Mohon "Save As" ke PDF.' 
          : (ext !== 'PDF' ? 'Format tidak didukung. Harap unggah PDF.' : undefined)
      } as FileRow;
    });

    setFiles(v => [...newFiles, ...v]); 

    for (const nf of newFiles) {
      if (nf.isAnalyzing && nf.file) {
        try {
          const res = await analyzePDF(nf.file);
          setFiles(prev => prev.map(f => f.id === nf.id ? { 
            ...f, 
            pages: res.totalPages, 
            bwPages: res.bwPages,
            lowColorPages: res.lowColorPages,
            mediumColorPages: res.mediumColorPages,
            highColorPages: res.highColorPages,
            details: res.pages, 
            isAnalyzing: false 
          } : f));
        } catch(e) {
          console.error(e);
          setFiles(prev => prev.map(f => f.id === nf.id ? { ...f, isAnalyzing: false, error: 'Gagal menganalisis PDF' } : f));
        }
      }
    }
  }

  const drop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }
  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
    if (selectedDocId === id) setSelectedDocId(null);
  }
  
  const selectedDoc = files.find(f => f.id === selectedDocId);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><FileText size={20}/></div>
          <h2>SwiftPrint <span>Analyzer</span></h2>
        </div>
        <button className="settings-btn" onClick={() => setShowSettings(true)}>
          <Settings size={18}/> Pengaturan Harga
        </button>
      </header>

      <main className="main-content">
        {!selectedDocId ? (
          <>
            <div 
              className={`upload-area ${drag ? 'drag-over' : ''}`}
              onDragOver={(e)=>{e.preventDefault();setDrag(true)}} 
              onDragLeave={()=>setDrag(false)} 
              onDrop={drop}
              onClick={() => input.current?.click()}
            >
              <div className="upload-icon"><CloudUpload size={48}/></div>
              <h3>Tarik & Lepas PDF di sini</h3>
              <p>Mendukung PDF, Word, dan Excel (Maksimal 100MB)</p>
            </div>

            {files.length > 0 && (
              <div className="file-list">
                <h3>Dokumen Anda ({files.length})</h3>
                <div className="list-grid">
                  {files.map(f => (
                    <div className="file-card" key={f.id} onClick={() => f.pages > 0 && setSelectedDocId(f.id)}>
                      <div className="file-card-header">
                        <div className="file-info">
                          <FileText className="file-icon" size={20}/>
                          <div>
                            <strong>{f.name}</strong>
                            <small>{f.size}</small>
                          </div>
                        </div>
                        <button className="del-btn" onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}><Trash2 size={16}/></button>
                      </div>
                      
                      <div className="file-card-body">
                        {f.error ? (
                          <span className="error-text">{f.error}</span>
                        ) : f.isAnalyzing ? (
                          <div className="analyzing"><Loader2 className="spin" size={16}/> Menganalisis dokumen...</div>
                        ) : (
                          <>
                            <div className="page-summary">
                              <span className="badge tag-bw" title="Hitam Putih">BW: {f.bwPages}</span>
                              <span className="badge tag-low" title="Warna Ringan">Low: {f.lowColorPages}</span>
                              <span className="badge tag-med" title="Warna Sedang">Med: {f.mediumColorPages}</span>
                              <span className="badge tag-high" title="Warna Penuh">Full: {f.highColorPages}</span>
                            </div>
                            <div className="price-tag">Estimasi: <b>{formatRupiah(calculatePrice(f))}</b></div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="detail-view">
            <div className="detail-header">
              <button className="back-btn" onClick={() => setSelectedDocId(null)}><ChevronLeft size={20}/> Kembali</button>
              <div className="detail-title">
                <h2>{selectedDoc?.name}</h2>
                <div className="total-price-banner">
                  Total Estimasi: <span>{formatRupiah(calculatePrice(selectedDoc!))}</span>
                </div>
              </div>
            </div>
            
            <div className="detail-stats">
              <div className="stat-box">
                <span>Total Halaman</span>
                <strong>{selectedDoc?.pages}</strong>
              </div>
              <div className="stat-box bw">
                <span>Hitam Putih (@ {formatRupiah(pricing.bw)})</span>
                <strong>{selectedDoc?.bwPages}</strong>
              </div>
              <div className="stat-box low">
                <span>Warna Ringan (@ {formatRupiah(pricing.low)})</span>
                <strong>{selectedDoc?.lowColorPages}</strong>
              </div>
              <div className="stat-box med">
                <span>Warna Sedang (@ {formatRupiah(pricing.medium)})</span>
                <strong>{selectedDoc?.mediumColorPages}</strong>
              </div>
              <div className="stat-box high">
                <span>Warna Penuh (@ {formatRupiah(pricing.high)})</span>
                <strong>{selectedDoc?.highColorPages}</strong>
              </div>
            </div>

            <div className="pages-grid">
              {selectedDoc?.details?.map((p, i) => (
                <div className="page-card" key={i}>
                  <div className="page-img">
                    <img src={p.thumbnail} alt={`Halaman ${p.pageNum}`} loading="lazy"/>
                    <div className="page-num">{p.pageNum}</div>
                  </div>
                  <div className="page-info">
                    <span className={`tag-${p.colorCategory}`}>
                      {p.colorCategory === 'bw' ? 'Hitam Putih' : 
                       p.colorCategory === 'low' ? 'Ringan' : 
                       p.colorCategory === 'medium' ? 'Sedang' : 'Penuh'}
                    </span>
                    <small>{p.colorCoverage.toFixed(1)}% warna</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <input ref={input} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls" hidden onChange={(e:ChangeEvent<HTMLInputElement>)=>addFiles(e.target.files)}/>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Pengaturan Harga</h2>
              <button onClick={() => setShowSettings(false)}><X size={20}/></button>
            </div>
            <div className="modal-body">
              <p className="help-text">Atur harga per lembar berdasarkan intensitas warna yang terdeteksi pada dokumen.</p>
              
              <form onSubmit={e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                savePricing({
                  bw: Number(fd.get('bw')),
                  low: Number(fd.get('low')),
                  medium: Number(fd.get('medium')),
                  high: Number(fd.get('high')),
                });
              }}>
                <div className="form-group">
                  <label><span className="dot dot-bw"></span> Hitam Putih (0%)</label>
                  <input type="number" name="bw" defaultValue={pricing.bw} required />
                </div>
                <div className="form-group">
                  <label><span className="dot dot-low"></span> Warna Ringan (0.1% - 5%)</label>
                  <input type="number" name="low" defaultValue={pricing.low} required />
                </div>
                <div className="form-group">
                  <label><span className="dot dot-med"></span> Warna Sedang (5% - 30%)</label>
                  <input type="number" name="medium" defaultValue={pricing.medium} required />
                </div>
                <div className="form-group">
                  <label><span className="dot dot-high"></span> Warna Penuh (&gt; 30%)</label>
                  <input type="number" name="high" defaultValue={pricing.high} required />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>Batal</button>
                  <button type="submit" className="btn-primary">Simpan Harga</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
