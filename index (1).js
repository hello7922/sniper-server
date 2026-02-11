const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (WordPress)
app.use(cors());
app.use(express.json());

// Session storage
const sessions = {
  tradelocker: {
    accessToken: null,
    accountId: null,
    accNum: null,
    balance: 0,
    currency: 'USD'
  },
  mt: {
    connected: false,
    accountNumber: null,
    broker: null,
    server: null,
    platform: null,
    balance: 0,
    currency: 'USD'
  }
};

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '🎯 Sniper Trade Server is running!',
    endpoints: {
      status: '/api/status',
      tradelocker: '/api/tradelocker/login',
      mt: '/api/mt/login'
    }
  });
});

// ========== TRADELOCKER ==========

app.post('/api/tradelocker/login', async (req, res) => {
  try {
    const { email, password, server, accountNumber } = req.body;
    
    if (!email || !password || !server) {
      return res.status(400).json({ error: 'Email, password, and server required' });
    }
    
    console.log(`🔐 TradeLocker: Login attempt for ${email}`);
    
    // Authenticate
    const authResponse = await axios.post('https://auth.tradelocker.com/oauth/token', {
      grant_type: 'password',
      username: email,
      password: password,
      server: server
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const { access_token } = authResponse.data;
    sessions.tradelocker.accessToken = access_token;
    
    // Get accounts
    const accountsResponse = await axios.get('https://api.tradelocker.com/auth/jwt/all-accounts', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    
    const accounts = accountsResponse.data.accounts || [];
    
    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No trading accounts found' });
    }
    
    // If no account number, return list for selection
    if (!accountNumber) {
      console.log(`📋 TradeLocker: Found ${accounts.length} accounts`);
      return res.json({
        success: false,
        needsAccountSelection: true,
        accounts: accounts.map(a => ({
          accNum: a.accNum,
          id: a.id,
          currency: a.currency,
          balance: a.balance,
          type: a.accountType || 'Trading'
        }))
      });
    }
    
    // Find specific account
    const account = accounts.find(a => 
      String(a.accNum) === String(accountNumber) || 
      String(a.id) === String(accountNumber)
    );
    
    if (!account) {
      return res.status(400).json({ 
        error: `Account ${accountNumber} not found`,
        availableAccounts: accounts.map(a => ({ accNum: a.accNum, currency: a.currency }))
      });
    }
    
    // Store session
    sessions.tradelocker.accountId = account.id;
    sessions.tradelocker.accNum = account.accNum;
    sessions.tradelocker.balance = account.balance || 0;
    sessions.tradelocker.currency = account.currency || 'USD';
    
    console.log(`✅ TradeLocker: Connected to account #${account.accNum}`);
    
    res.json({
      success: true,
      accNum: account.accNum,
      balance: account.balance,
      equity: account.equity,
      currency: account.currency
    });
    
  } catch (error) {
    console.error('❌ TradeLocker error:', error.response?.data || error.message);
    res.status(401).json({ 
      error: 'TradeLocker login failed',
      details: error.response?.data?.message || error.message
    });
  }
});

app.post('/api/tradelocker/order', (req, res) => {
  if (!sessions.tradelocker.accessToken) {
    return res.status(401).json({ error: 'Not connected' });
  }
  
  const { symbol, side, volume, stopLoss, takeProfit } = req.body;
  console.log(`📤 TradeLocker: ${side} ${volume} ${symbol}`);
  
  // Demo order
  const orderId = `TL_${Date.now()}`;
  res.json({ success: true, orderId, platform: 'tradelocker' });
});

app.delete('/api/tradelocker/position/:id', (req, res) => {
  console.log(`❌ TradeLocker: Close position ${req.params.id}`);
  res.json({ success: true });
});

// ========== MT4/MT5 ==========

app.post('/api/mt/login', (req, res) => {
  const { accountNumber, password, broker, server, platform } = req.body;
  
  if (!accountNumber || !password || !server || !platform) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  console.log(`🔐 MT${platform === 'mt5' ? '5' : '4'}: Login ${accountNumber}@${server}`);
  
  // Store session (demo mode)
  sessions.mt = {
    connected: true,
    accountNumber,
    broker,
    server,
    platform,
    balance: 10000,
    currency: 'USD'
  };
  
  console.log(`✅ MT: Connected #${accountNumber} (demo mode)`);
  
  res.json({
    success: true,
    accountNumber,
    broker,
    server,
    platform,
    balance: 10000,
    equity: 10000,
    currency: 'USD',
    method: 'demo',
    note: 'Running in demo mode'
  });
});

app.post('/api/mt/order', (req, res) => {
  if (!sessions.mt.connected) {
    return res.status(401).json({ error: 'Not connected' });
  }
  
  const { symbol, side, volume } = req.body;
  console.log(`📤 MT: ${side} ${volume} ${symbol}`);
  
  const orderId = `MT_${Date.now()}`;
  res.json({ success: true, orderId, platform: sessions.mt.platform });
});

app.delete('/api/mt/position/:id', (req, res) => {
  console.log(`❌ MT: Close position ${req.params.id}`);
  res.json({ success: true });
});

// ========== STATUS & DISCONNECT ==========

app.get('/api/status', (req, res) => {
  res.json({
    tradelocker: {
      connected: !!sessions.tradelocker.accessToken,
      accNum: sessions.tradelocker.accNum,
      balance: sessions.tradelocker.balance,
      currency: sessions.tradelocker.currency
    },
    mt: {
      connected: sessions.mt.connected,
      accountNumber: sessions.mt.accountNumber,
      broker: sessions.mt.broker,
      balance: sessions.mt.balance,
      currency: sessions.mt.currency
    }
  });
});

app.post('/api/disconnect', (req, res) => {
  sessions.tradelocker = {
    accessToken: null,
    accountId: null,
    accNum: null,
    balance: 0,
    currency: 'USD'
  };
  sessions.mt = {
    connected: false,
    accountNumber: null,
    broker: null,
    server: null,
    platform: null,
    balance: 0,
    currency: 'USD'
  };
  
  console.log('🔌 All platforms disconnected');
  res.json({ success: true });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  🎯 Sniper Trade Server                               ║
║  Running on port ${PORT}                                 ║
║                                                       ║
║  Endpoints:                                           ║
║  • GET  /api/status                                   ║
║  • POST /api/tradelocker/login                        ║
║  • POST /api/mt/login                                 ║
╚═══════════════════════════════════════════════════════╝
  `);
});
