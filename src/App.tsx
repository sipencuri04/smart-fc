import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import { FileText, CloudUpload, Settings, X, Loader2, Image, ChevronLeft, Trash2, FileCheck2 } from 'lucide-react'
import { analyzePDF, PageAnalysis, ColorCategory } from './pdfAnalyzer'

type Pricing = {
  bw: number;
  low: number;
  medium: number;
  high: number;
};

type AppConfig = {
  pricing: Pricing;
  apiSecret: string;
}

const DEFAULT_CONFIG: AppConfig = {
  pricing: { bw: 500, low: 1000, medium: 1500, high: 2000 },
  apiSecret: ''
};

const OFFICE_EXTENSIONS = ['DOCX', 'DOC', 'XLSX', 'XLS'];

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
  isConverting?: boolean;
  file?: File;
  error?: string;
}

function formatBytes(bytes: number) { 
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` 
}

function formatRupiah(number: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

async function convertFileToPDF(file: File, secret: string): Promise<File> {
  const formData = new FormData();
  formData.append('File', file);
  
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  // Jika secret mengandung koma atau enter, jadikan array dan pilih acak
  const secrets = secret.split(/[\n,]+/).map(s => s.trim()).filter(s => s);
  const activeSecret = secrets.length > 0 ? secrets[Math.floor(Math.random() * secrets.length)] : secret;

  const res = await fetch(`https://v2.convertapi.com/convert/${ext}/to/pdf?Secret=${activeSecret}`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.Message || 'Gagal mengonversi dokumen');
  }

  const data = await res.json();
  const fileData = data.Files[0].FileData;
  
  const resBase64 = await fetch(`data:application/pdf;base64,${fileData}`);
  const blob = await resBase64.blob();
  return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".pdf", { type: 'application/pdf' });
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileRow[]>([]); 
  const [drag, setDrag] = useState(false); 
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('swiftprint_config');
    if (saved) {
      try { setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) }); } catch(e) {}
    } else {
      const oldPricing = localStorage.getItem('swiftprint_pricing');
      if (oldPricing) {
        try { setConfig(c => ({...c, pricing: JSON.parse(oldPricing)})); } catch(e) {}
      }
    }
  }, []);

  const saveConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
    localStorage.setItem('swiftprint_config', JSON.stringify(newConfig));
    setShowSettings(false);
  };

  const calculatePrice = (f: FileRow) => {
    return (f.bwPages * config.pricing.bw) + (f.lowColorPages * config.pricing.low) + (f.mediumColorPages * config.pricing.medium) + (f.highColorPages * config.pricing.high);
  };

  const processFile = async (nf: FileRow) => {
    let targetFile = nf.file;
    
    if (nf.isConverting && targetFile) {
      try {
        targetFile = await convertFileToPDF(targetFile, config.apiSecret);
        setFiles(prev => prev.map(f => f.id === nf.id ? { ...f, isConverting: false, isAnalyzing: true } : f));
      } catch (e: any) {
        setFiles(prev => prev.map(f => f.id === nf.id ? { ...f, isConverting: false, isAnalyzing: false, error: e.message || 'Konversi gagal' } : f));
        return;
      }
    }

    if (targetFile) {
      try {
        const res = await analyzePDF(targetFile);
        setFiles(prev => prev.map(f => f.id === nf.id ? { 
          ...f, 
          pages: res.totalPages, 
          bwPages: res.bwPages,
          lowColorPages: res.lowColorPages,
          mediumColorPages: res.mediumColorPages,
          highColorPages: res.highColorPages,
          details: res.pages, 
          isAnalyzing: false,
          isConverting: false
        } : f));
      } catch(e) {
        setFiles(prev => prev.map(f => f.id === nf.id ? { ...f, isAnalyzing: false, isConverting: false, error: 'Gagal menganalisis PDF' } : f));
      }
    }
  }

  const addFiles = async (list: FileList | null) => { 
    if (!list?.length) return; 
    
    const newFiles = Array.from(list).map(f => {
      const ext = f.name.split('.').pop()?.toUpperCase() || '';
      const isOffice = OFFICE_EXTENSIONS.includes(ext);
      
      let error = undefined;
      let isConverting = false;
      let isAnalyzing = false;
      
      if (ext === 'PDF') {
        isAnalyzing = true;
      } else if (isOffice) {
        if (!config.apiSecret) {
          error = 'Sistem butuh "ConvertAPI Secret" di Pengaturan untuk bisa otomatis konversi Word/Excel.';
        } else {
          isConverting = true;
        }
      } else {
        error = 'Format tidak didukung. Harap unggah PDF, Word, atau Excel.';
      }

      return { 
        id: Math.random().toString(36).substring(7),
        name: f.name,
        size: formatBytes(f.size),
        pages: 0, bwPages: 0, lowColorPages: 0, mediumColorPages: 0, highColorPages: 0,
        type: ext,
        file: f,
        isConverting,
        isAnalyzing,
        error
      } as FileRow;
    });

    setFiles(v => [...newFiles, ...v]); 

    for (const nf of newFiles) {
      if (!nf.error && (nf.isConverting || nf.isAnalyzing)) {
        processFile(nf); 
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
          <Settings size={18}/> Pengaturan
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
              <h3>Tarik & Lepas Dokumen di sini</h3>
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
                          <FileCheck2 className="file-icon" size={20} style={{color: f.type === 'PDF' ? '#ef4444' : f.type.includes('DOC') ? '#2563eb' : '#16a34a'}}/>
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
                        ) : f.isConverting ? (
                          <div className="analyzing"><Loader2 className="spin" size={16}/> Mengubah ke PDF...</div>
                        ) : f.isAnalyzing ? (
                          <div className="analyzing"><Loader2 className="spin" size={16}/> Menganalisis warna...</div>
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
                <span>Hitam Putih (@ {formatRupiah(config.pricing.bw)})</span>
                <strong>{selectedDoc?.bwPages}</strong>
              </div>
              <div className="stat-box low">
                <span>Warna Ringan (@ {formatRupiah(config.pricing.low)})</span>
                <strong>{selectedDoc?.lowColorPages}</strong>
              </div>
              <div className="stat-box med">
                <span>Warna Sedang (@ {formatRupiah(config.pricing.medium)})</span>
                <strong>{selectedDoc?.mediumColorPages}</strong>
              </div>
              <div className="stat-box high">
                <span>Warna Penuh (@ {formatRupiah(config.pricing.high)})</span>
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
              <h2>Pengaturan</h2>
              <button onClick={() => setShowSettings(false)}><X size={20}/></button>
            </div>
            <div className="modal-body">
              
              <form onSubmit={e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                saveConfig({
                  apiSecret: fd.get('apiSecret') as string,
                  pricing: {
                    bw: Number(fd.get('bw')),
                    low: Number(fd.get('low')),
                    medium: Number(fd.get('medium')),
                    high: Number(fd.get('high')),
                  }
                });
              }}>
                <div className="settings-section">
                  <h3>Integrasi ConvertAPI</h3>
                  <p className="help-text" style={{marginTop: 0}}>Dibutuhkan agar file Word/Excel bisa dibaca. Daftar di convertapi.com untuk mendapatkan Secret. Anda bisa memasukkan <b>banyak API Secret sekaligus</b> (pisahkan dengan koma atau Enter) untuk menggabungkan kuota dari banyak akun!</p>
                  <div className="form-group">
                    <textarea 
                      name="apiSecret" 
                      placeholder="Contoh:&#10;RahasiaAkun1&#10;RahasiaAkun2&#10;RahasiaAkun3" 
                      defaultValue={config.apiSecret} 
                      rows={4}
                      style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical'}}
                    />
                  </div>
                </div>

                <div className="settings-section" style={{marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0'}}>
                  <h3>Tarif Harga per Lembar</h3>
                  <div className="form-group">
                    <label><span className="dot dot-bw"></span> Hitam Putih (0%)</label>
                    <input type="number" name="bw" defaultValue={config.pricing.bw} required />
                  </div>
                  <div className="form-group">
                    <label><span className="dot dot-low"></span> Warna Ringan (0.1% - 5%)</label>
                    <input type="number" name="low" defaultValue={config.pricing.low} required />
                  </div>
                  <div className="form-group">
                    <label><span className="dot dot-med"></span> Warna Sedang (5% - 30%)</label>
                    <input type="number" name="medium" defaultValue={config.pricing.medium} required />
                  </div>
                  <div className="form-group">
                    <label><span className="dot dot-high"></span> Warna Penuh (&gt; 30%)</label>
                    <input type="number" name="high" defaultValue={config.pricing.high} required />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>Batal</button>
                  <button type="submit" className="btn-primary">Simpan Pengaturan</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
