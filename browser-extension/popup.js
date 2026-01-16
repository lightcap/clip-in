// Default Clip In URL - users can configure this
const DEFAULT_CLIP_IN_URL = 'http://localhost:3002';

// Get the configured Clip In URL
async function getClipInUrl() {
  const result = await chrome.storage.local.get('clipInUrl');
  return result.clipInUrl || DEFAULT_CLIP_IN_URL;
}

// Save the Clip In URL
async function setClipInUrl(url) {
  await chrome.storage.local.set({ clipInUrl: url });
}

// Check if we're on Peloton
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Send message to content script to get token
async function getTokenFromPage(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'getToken' });
    return response;
  } catch (e) {
    console.error('Failed to get token:', e);
    return { error: 'Could not communicate with page. Try refreshing Peloton.' };
  }
}

// Helper to create elements safely
function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') el.className = value;
    else if (key === 'textContent') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value);
  });
  children.forEach(child => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  });
  return el;
}

// Render not on Peloton state
function renderNotOnPeloton(content, clipInUrl) {
  content.replaceChildren();

  const status = createElement('div', { className: 'status not-peloton' }, [
    'Navigate to ',
    createElement('strong', { textContent: 'members.onepeloton.com' }),
    ' and log in, then click this extension again.'
  ]);

  const openBtn = createElement('button', {
    className: 'btn btn-secondary',
    textContent: 'Open Peloton',
    onClick: () => chrome.tabs.create({ url: 'https://members.onepeloton.com' })
  });

  const inputGroup = createElement('div', { className: 'input-group', style: 'margin-top: 16px;' }, [
    createElement('label', { textContent: 'Clip In URL' }),
    createElement('input', { type: 'text', id: 'clipInUrl', value: clipInUrl, placeholder: 'http://localhost:3002' })
  ]);

  const saveBtn = createElement('button', {
    className: 'btn btn-secondary',
    textContent: 'Save URL',
    onClick: async () => {
      const url = document.getElementById('clipInUrl').value.trim();
      if (url) {
        await setClipInUrl(url);
        alert('URL saved!');
      }
    }
  });

  content.appendChild(status);
  content.appendChild(openBtn);
  content.appendChild(inputGroup);
  content.appendChild(saveBtn);
}

// Render error state
function renderError(content, message, tabId) {
  content.replaceChildren();

  const status = createElement('div', { className: 'status logged-out', textContent: message });
  const refreshBtn = createElement('button', {
    className: 'btn btn-secondary',
    textContent: 'Refresh Page',
    onClick: () => {
      chrome.tabs.reload(tabId);
      window.close();
    }
  });

  content.appendChild(status);
  content.appendChild(refreshBtn);
}

// Render ready state
function renderReady(content, tokenResult, clipInUrl) {
  content.replaceChildren();

  const statusText = `Ready to connect! Logged in as: ${tokenResult.username || 'Peloton User'}`;
  const status = createElement('div', { className: 'status ready' }, [
    createElement('strong', { textContent: 'Ready to connect!' }),
    document.createElement('br'),
    `Logged in as: ${tokenResult.username || 'Peloton User'}`
  ]);

  const connectBtn = createElement('button', {
    className: 'btn btn-primary',
    id: 'connect',
    textContent: 'Connect to Clip In',
    onClick: async function() {
      this.disabled = true;
      this.textContent = 'Connecting...';

      const url = document.getElementById('clipInUrl').value.trim() || clipInUrl;
      await setClipInUrl(url);

      let callbackUrl = `${url}/api/peloton/callback?token=${encodeURIComponent(tokenResult.token)}`;
      if (tokenResult.refreshToken) {
        callbackUrl += `&refresh_token=${encodeURIComponent(tokenResult.refreshToken)}`;
      }
      chrome.tabs.create({ url: callbackUrl });
      window.close();
    }
  });

  const inputGroup = createElement('div', { className: 'input-group', style: 'margin-top: 16px;' }, [
    createElement('label', { textContent: 'Clip In URL' }),
    createElement('input', { type: 'text', id: 'clipInUrl', value: clipInUrl, placeholder: 'http://localhost:3002' })
  ]);

  const saveBtn = createElement('button', {
    className: 'btn btn-secondary',
    textContent: 'Save URL',
    onClick: async () => {
      const url = document.getElementById('clipInUrl').value.trim();
      if (url) {
        await setClipInUrl(url);
        alert('URL saved!');
      }
    }
  });

  content.appendChild(status);
  content.appendChild(connectBtn);
  content.appendChild(inputGroup);
  content.appendChild(saveBtn);
}

// Render the popup content
async function render() {
  const content = document.getElementById('content');
  const tab = await getCurrentTab();
  const clipInUrl = await getClipInUrl();
  const isPelotonPage = tab?.url?.includes('members.onepeloton.com');

  if (!isPelotonPage) {
    renderNotOnPeloton(content, clipInUrl);
    return;
  }

  // We're on Peloton - show loading
  content.replaceChildren(
    createElement('div', { className: 'status ready', textContent: 'Checking Peloton login status...' })
  );

  const tokenResult = await getTokenFromPage(tab.id);

  if (tokenResult.error) {
    renderError(content, tokenResult.error, tab.id);
    return;
  }

  if (!tokenResult.token) {
    renderError(content, 'Please log in to Peloton first, then try again.', tab.id);
    return;
  }

  renderReady(content, tokenResult, clipInUrl);
}

// Initialize
document.addEventListener('DOMContentLoaded', render);
