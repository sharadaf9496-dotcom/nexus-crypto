import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import { Rocket } from 'lucide-react';

// --- HELPER: Convert Image to String for Database ---
const convertToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.readAsDataURL(file);
    fileReader.onload = () => resolve(fileReader.result);
    fileReader.onerror = (error) => reject(error);
  });
};

// --- SCREENSAVER COMPONENT ---
const Screensaver = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];
    const resize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();
    class Particle {
      constructor() {
        this.x = Math.random() * width; this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.5; this.vy = (Math.random() - 0.5) * 0.5; this.size = Math.random() * 2;
      }
      update() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < 0 || this.x > width) this.vx *= -1; if (this.y < 0 || this.y > height) this.vy *= -1;
      }
      draw() {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (let i = 0; i < 80; i++) particles.push(new Particle());
    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, index) => {
        p.update(); p.draw();
        for (let j = index + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
          if (dist < 150) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 - dist / 1500})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          }
        }
      });
      requestAnimationFrame(animate);
    };
    animate();
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, zIndex: -1, background: 'radial-gradient(circle at 50% 50%, #1a1f2e 0%, #0b0e14 100%)' }} />;
};

// --- CANDLE GENERATOR (Helper) ---
const Candle = ({ index }) => {
  const height = Math.floor(Math.random() * 60) + 20; 
  const isGreen = Math.random() > 0.45; 
  const offset = Math.floor(Math.random() * 40) - 20; 
  const delay = Math.random() * 2; 

  return (
    <div className={`candle ${isGreen ? 'green' : 'red'}`} style={{ marginTop: `${offset}px` }}>
      <div className="wick" style={{ height: `${height + 20}px` }}></div>
      <div className="body" style={{ height: `${height}px`, animationDelay: `${delay}s` }}></div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
function App() {
  const [view, setView] = useState('auth'); 
  const [authMode, setAuthMode] = useState('login'); 
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0.00);
  const [marketData, setMarketData] = useState([]);
  const [modal, setModal] = useState(null); 
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [file, setFile] = useState(null);

  // Admin Data
  const [adminData, setAdminData] = useState([]); // Pending requests
  const [allUsers, setAllUsers] = useState([]); // List of users

  const [formData, setFormData] = useState({ name: '', email: '', password: '', pin: '' });
  const [txData, setTxData] = useState({ address: '', amount: '' });

  // 1. Initial Market Data Fetch
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=try&order=market_cap_desc&per_page=10&page=1&sparkline=false')
      .then(res => res.json())
      .then(data => setMarketData(data))
      .catch(e => console.error(e));
  }, []);

  // 2. LIVE POLLING (Updates Balance & Admin Panel automatically)
  useEffect(() => {
    const interval = setInterval(() => {
      // If User is logged in, check their real balance from DB
      if (user && view === 'dashboard') {
        fetch(`/api/user/${user.email}`)
          .then(res => res.json())
          .then(data => {
            if (data.balance !== undefined) setBalance(data.balance);
          });
      }
      // If Admin is logged in, check for new requests
      if (user?.isAdmin && view === 'admin') {
        fetchAdminData();
      }
    }, 5000); // Runs every 5 seconds
    return () => clearInterval(interval);
  }, [user, view]);

  const fetchAdminData = async () => {
    // Get Pending Requests
    const resTx = await fetch('/api/admin/pending');
    const dataTx = await resTx.json();
    setAdminData(dataTx);

    // Get All Users List
    const resUsers = await fetch('/api/admin/users');
    const dataUsers = await resUsers.json();
    setAllUsers(dataUsers);
  };

  const handleAuth = async () => {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        if (authMode === 'register') {
          alert("Account Created! Please Login.");
          setAuthMode('login');
        } else {
          setUser(data.user);
          setBalance(data.user.balance || 0); // Set initial balance
          // Redirect based on role
          if (data.user.isAdmin) {
            setView('admin');
            fetchAdminData(); // Load admin data immediately
          } else {
            setView('dashboard');
          }
        }
      } else {
        alert(data.message);
      }
    } catch (e) { alert("Server Error. Make sure backend is running."); }
  };

  // Unified Transaction Handler (Deposit & Withdraw)
  const submitTransaction = async (type) => {
    if (!txData.amount) return alert("Enter amount.");

    let payload = {
      userEmail: user.email,
      type: type,
      amount: parseFloat(txData.amount),
      walletAddress: txData.address || "",
      proofImage: ""
    };

    if (type === 'deposit') {
      if (!file) return alert("Please upload a receipt.");
      // Convert image file to text string for DB
      payload.proofImage = await convertToBase64(file);
    }

    const res = await fetch('/api/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      alert("Request Submitted! Waiting for Admin Approval.");
      setModal(null); 
      setFile(null); 
      setTxData({ address: '', amount: '' });
    } else {
      alert("Error submitting request.");
    }
  };

  // Admin Action Handler
  const handleAdminDecision = async (id, decision) => {
    await fetch('/api/admin/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, decision })
    });
    fetchAdminData(); // Refresh list instantly
  };

  // Chart Logic
  useEffect(() => {
    if (modal === 'chart' && selectedCoin) {
      const container = document.getElementById('chart-container');
      if(container) container.innerHTML = '<div id="tradingview_widget" style="height:100%"></div>';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        new window.TradingView.widget({
          "autosize": true, "symbol": `BINANCE:${selectedCoin}USDT`, "interval": "D", "timezone": "Etc/UTC", "theme": "dark", "style": "1", "locale": "en", "container_id": "tradingview_widget"
        });
      };
      container.appendChild(script);
    }
  }, [modal, selectedCoin]);

  return (
    <>
      <Screensaver />

      {/* --- AUTH SCREEN --- */}
      {view === 'auth' && (
        <div className="auth-wrapper fade-in">
          <div className="phone-mockup">
            <div className="phone-screen">
              <div className="bonus-banner">🎉 10% BONUS ON FIRST DEPOSIT</div>
              <div style={{color:'var(--text-muted)', fontSize:'0.9rem'}}>Portfolio value</div>
              <div className="portfolio-value">$89,441.67</div>
              <div className="portfolio-change">↗ $13,123.67 (+17.2%)</div>
              <div className="portfolio-chart">
                 {[...Array(15)].map((_, i) => <Candle key={i} index={i} />)}
              </div>
              <div className="auto-earn-card">
                 <div style={{display:'flex', alignItems:'center'}}>
                   <div className="earn-icon"><Rocket size={20} color="#fff" /></div>
                   <div><div style={{fontWeight:'bold'}}>Auto Earn</div><div style={{fontSize:'0.8rem'}}>Lifetime rewards</div></div>
                 </div>
                 <div style={{fontWeight:'bold', color:'var(--accent)'}}>$3.26</div>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ width: 380, padding: 40, textAlign: 'center', zIndex: 10 }}>
            <h1 style={{ background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '2.5rem', margin: '0 0 10px 0' }}>NEXUS</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 30 }}>Institutional Grade DeFi Terminal</p>
            {authMode === 'register' && <input placeholder="Full Name" onChange={e => setFormData({...formData, name: e.target.value})} />}
            <input placeholder="Email" onChange={e => setFormData({...formData, email: e.target.value})} />
            <input type="password" placeholder="Password" onChange={e => setFormData({...formData, password: e.target.value})} />
            <input type="number" placeholder="4-Digit PIN" onChange={e => setFormData({...formData, pin: e.target.value})} />
            <button onClick={handleAuth}>{authMode === 'login' ? 'SECURE LOGIN' : 'INITIALIZE ACCOUNT'}</button>
            <p onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ marginTop: 20, cursor: 'pointer', color: 'var(--primary)', fontSize: '0.9rem' }}>
              {authMode === 'login' ? 'Create New Account' : 'Back to Login'}
            </p>
          </div>
        </div>
      )}

      {/* --- ADMIN PANEL (Only visible to Admin) --- */}
      {view === 'admin' && (
        <div className="fade-in" style={{ maxWidth: 1000, margin: '5vh auto', padding: 20 }}>
           <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
              <h2>🛡️ Admin Control Center</h2>
              <button style={{width:'auto', background:'#333'}} onClick={() => setView('auth')}>Logout</button>
           </div>

           {/* SECTION 1: PENDING REQUESTS */}
           <div className="glass-panel" style={{padding:20, marginBottom: 30}}>
              <h3>⏳ Pending Requests</h3>
              {adminData.length === 0 ? <p style={{color:'#666'}}>No pending transactions.</p> : (
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                   <thead>
                      <tr style={{textAlign:'left', color:'var(--text-muted)'}}><th>User</th><th>Type</th><th>Amount</th><th>Proof / Address</th><th>Actions</th></tr>
                   </thead>
                   <tbody>
                      {adminData.map(tx => (
                        <tr key={tx._id} style={{borderBottom:'1px solid var(--border)'}}>
                           <td style={{padding:'15px 0'}}>{tx.userEmail}</td>
                           <td style={{textTransform:'uppercase', color: tx.type==='deposit'?'var(--accent)':'#ff5252'}}>{tx.type}</td>
                           <td style={{fontWeight:'bold'}}>${tx.amount}</td>
                           
                           {/* 🔴 FIXED: Shows Wallet Address for Withdrawals */}
                           <td>
                             {tx.type === 'deposit' ? (
                               tx.proofImage ? (
                                 <button style={{padding:'5px 10px', width:'auto', fontSize:'0.7rem', background:'#444'}} 
                                   onClick={() => { 
                                     const win = window.open(); 
                                     win.document.write(`<img src="${tx.proofImage}" style="max-width:100%"/>`); 
                                   }}>View Image</button>
                               ) : <span style={{color:'red', fontSize:'0.8rem'}}>No Proof</span>
                             ) : (
                               <span style={{fontFamily:'monospace', background:'#222', padding:'4px 8px', borderRadius:4, fontSize:'0.85rem', border:'1px solid #444', color: '#fff', userSelect:'all'}}>
                                 {tx.walletAddress || "No Address"}
                               </span>
                             )}
                           </td>

                           <td style={{display:'flex', gap:10, paddingTop:10}}>
                              <button style={{background:'var(--accent)', padding:'5px 15px', width:'auto'}} onClick={() => handleAdminDecision(tx._id, 'approved')}>Approve</button>
                              <button style={{background:'#ff5252', padding:'5px 15px', width:'auto'}} onClick={() => handleAdminDecision(tx._id, 'rejected')}>Reject</button>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              )}
           </div>

           {/* SECTION 2: ALL REGISTERED USERS */}
           <div className="glass-panel" style={{padding:20}}>
              <h3>👥 All Registered Clients</h3>
              {allUsers.length === 0 ? <p style={{color:'#666'}}>No users found.</p> : (
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                   <thead>
                      <tr style={{textAlign:'left', color:'var(--text-muted)'}}><th>Name</th><th>Email</th><th>PIN</th><th>Current Balance</th></tr>
                   </thead>
                   <tbody>
                      {allUsers.map(u => (
                        <tr key={u._id} style={{borderBottom:'1px solid var(--border)'}}>
                           <td style={{padding:'15px 0'}}>{u.name || 'No Name'}</td>
                           <td>{u.email}</td>
                           <td>{u.pin}</td>
                           <td style={{fontWeight:'bold', color: 'var(--accent)'}}>${u.balance.toFixed(2)}</td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              )}
           </div>
        </div>
      )}

      {/* --- USER DASHBOARD --- */}
      {view === 'dashboard' && (
        <div className="fade-in" style={{ maxWidth: 1200, margin: '5vh auto', height: '90vh', display: 'grid', gridTemplateRows: 'auto 1fr', gap: 30, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>NEXUS</div>
            <div className="glass-panel" style={{ padding: '8px 20px', borderRadius: 50, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%' }} />
              <span>{user?.name || 'User'}</span>
              <span style={{ cursor: 'pointer', color: '#94a3b8', marginLeft: 10 }} onClick={() => window.location.reload()}>×</span>
            </div>
          </div>
          <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 30, height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
              <div className="glass-panel" style={{ padding: 40, textAlign: 'center', background: 'linear-gradient(135deg, rgba(41, 98, 255, 0.2) 0%, rgba(255,255,255,0.01) 100%)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Available Balance</div>
                
                {/* LIVE REAL BALANCE */}
                <div style={{ fontSize: '3rem', fontWeight: 700, margin: '10px 0' }}>$ {balance.toFixed(2)}</div>
                
                <div style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>Ready to Trade</div>
              </div>
              <div className="glass-panel" style={{ padding: 20 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 15 }}>QUICK ACTIONS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                  <ActionBtn icon="💎" label="Buy" onClick={() => window.open('https://www.btcturk.com/', '_blank')} />
                  <ActionBtn icon="🔄" label="Swap" onClick={() => window.open('https://app.uniswap.org/', '_blank')} />
                  <ActionBtn icon="⬇️" label="Deposit" onClick={() => setModal('deposit')} />
                  <ActionBtn icon="⬆️" label="Withdraw" onClick={() => setModal('withdraw')} />
                </div>
              </div>
            </div>
            <div className="glass-panel" style={{ padding: 30, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 15 }}>
                <h3>Live Market (TRY)</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Click for Charts</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, paddingRight: 10 }}>
                {marketData.map(coin => (
                  <div key={coin.id} onClick={() => { setSelectedCoin(coin.symbol.toUpperCase()); setModal('chart'); }} 
                       style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                      <img src={coin.image} style={{ width: 32, height: 32, borderRadius: '50%' }} alt={coin.name} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{coin.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{coin.symbol.toUpperCase()}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>₺{coin.current_price.toLocaleString()}</div>
                      <div style={{ fontSize: '0.8rem', color: coin.price_change_percentage_24h >= 0 ? 'var(--accent)' : '#ff5252' }}>
                        {coin.price_change_percentage_24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="glass-panel" style={{ width: modal === 'chart' ? '90%' : 450, height: modal === 'chart' ? '80vh' : 'auto', padding: 40, position: 'relative' }}>
            <span onClick={() => { setModal(null); setFile(null); setSelectedCoin(null); }} style={{ position: 'absolute', top: 20, right: 20, cursor: 'pointer', color: '#fff' }}>✕</span>
            
            {modal === 'deposit' && (
              <>
                <h2 style={{ marginTop: 0 }}>Deposit Assets</h2>
                <p style={{ color: 'var(--text-muted)' }}>Send USDT (TRC20) to your vault.</p>
                
                {/* 🔴 FIXED: PASTE YOUR REAL WALLET ADDRESS BELOW 🔴 */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 15, borderRadius: 8, fontFamily: 'monospace', border: '1px dashed var(--border)', margin: '20px 0', wordBreak: 'break-all', userSelect:'all' }}>
                   TANoL7ZN21jrBSkKLhPuLZqurNxkX1giTv
                </div>
                
                <input type="number" placeholder="Enter Amount Sent" onChange={e => setTxData({...txData, amount: e.target.value})} />
                <label style={{ display: 'block', padding: 15, border: '1px dashed var(--border)', borderRadius: 12, textAlign: 'center', cursor: 'pointer', marginBottom: 20, color: file ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {file ? '✅ Screenshot Selected' : '📸 Upload Receipt'}
                  <input type="file" style={{ display: 'none' }} accept="image/*" onChange={e => setFile(e.target.files[0])} />
                </label>
                <button onClick={() => submitTransaction('deposit')}>Confirm Deposit</button>
              </>
            )}

            {modal === 'withdraw' && (
              <>
                <h2 style={{ marginTop: 0 }}>Withdraw Funds</h2>
                <input placeholder="TRC20 Wallet Address" onChange={e => setTxData({...txData, address: e.target.value})} />
                <input type="number" placeholder="Amount (USDT)" onChange={e => setTxData({...txData, amount: e.target.value})} />
                <button onClick={() => submitTransaction('withdraw')}>Confirm Withdrawal</button>
              </>
            )}

            {modal === 'chart' && (
              <div id="chart-container" style={{ width: '100%', height: '100%' }}>
                <div id="tradingview_widget" style={{ height: '100%' }}></div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const ActionBtn = ({ icon, label, onClick }) => (
  <div onClick={onClick} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', padding: 20, borderRadius: 16, textAlign: 'center', cursor: 'pointer', transition: '0.3s' }}
       onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
       onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
    <div style={{ fontSize: '1.8rem', marginBottom: 10 }}>{icon}</div>
    <div>{label}</div>
  </div>
);

export default App;