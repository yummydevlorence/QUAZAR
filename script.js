const ICON_STAR = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="currentColor"/></svg>';
const ICON_COMMENT = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor"/></svg>';
const TOKEN_KEY = 'quazar_auth_token';
const GUEST_CART_KEY = 'quazar_guest_cart';
const $ = (id) => document.getElementById(id);
const modal = $('login-modal');
const logoutModal = $('logout-modal');
const accountLink = $('account-link');
const state = { token: '', user: null, orders: [], products: [], cart: { items: [], subtotal: 0 }, promo: null, pendingCheckout: false };
let mode = 'login';
let authStep = 'credentials';
let pendingEmail = '';
let welcomeTimer;
let welcomeHideTimer;
let welcomeFade;
let previousOverflow = '';
let accView = '';
let accFilter = 'all';
let accLoaded = false;
let accError = '';
let accTimer;

// When the page is opened from Live Server or as a file, talk to the QuazarTech server on port 3000.
const API_BASE = (location.protocol === 'file:' ||
  (['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '3000' && location.port !== ''))
  ? 'http://localhost:3000' : '';

function apiConnectionError() {
  return API_BASE
    ? 'Could not reach the QuazarTech server. In the project folder, run "npm start" and keep it running (it uses http://localhost:3000).'
    : 'Could not connect to QuazarTech. Please try again.';
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error(apiConnectionError());
  }

  let data = {};
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('The server returned an unreadable response. Please try again.');
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function render() {
  const loggedIn = Boolean(state.user);
  document.body.classList.toggle('logged-in', loggedIn);
  $('account-nav').hidden = !loggedIn;
  accountLink.textContent = loggedIn ? 'Log out' : 'Login';
  renderCartCount();
}

function showWelcome(name = '') {
  const root = document.documentElement;
  const box = $('welcome');
  const audio = $('welcomeAudio');
  clearTimeout(welcomeTimer);
  clearTimeout(welcomeHideTimer);
  clearInterval(welcomeFade);

  const firstName = String(name).trim().split(/\s+/)[0];
  $('welcomeName').textContent = firstName ? `Hi, ${firstName}!` : '';
  box.classList.remove('hide');
  root.classList.remove('show-welcome');
  void box.offsetWidth;
  root.classList.add('show-welcome');
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  if (audio) {
    audio.currentTime = 0;
    audio.volume = 0.7;
    audio.play().catch(() => {});
  }
  welcomeTimer = setTimeout(hideWelcome, 4500);
}

function hideWelcome() {
  const root = document.documentElement;
  const box = $('welcome');
  const audio = $('welcomeAudio');
  clearTimeout(welcomeTimer);
  if (!box || !root.classList.contains('show-welcome')) return;

  box.classList.add('hide');
  document.body.style.overflow = previousOverflow;
  if (audio && !audio.paused) {
    clearInterval(welcomeFade);
    welcomeFade = setInterval(() => {
      audio.volume = Math.max(0, audio.volume - 0.1);
      if (audio.volume <= 0) {
        clearInterval(welcomeFade);
        audio.pause();
      }
    }, 80);
  }
  welcomeHideTimer = setTimeout(() => root.classList.remove('show-welcome'), 900);
}

function setMode(nextMode) {
  mode = nextMode;
  authStep = 'credentials';
  pendingEmail = '';
  const signup = mode === 'signup';
  $('modal-title').textContent = signup ? 'Create account' : 'Welcome back';
  $('submit-btn').textContent = signup ? 'Sign up' : 'Log in';
  $('switch-text').textContent = signup ? 'Already have an account?' : 'No account yet?';
  $('switch-link').textContent = signup ? 'Log in' : 'Sign up';
  $('auth-switch').hidden = false;
  $('credentialsFields').hidden = false;
  $('otpField').hidden = true;
  $('nameField').hidden = !signup;
  $('phoneField').hidden = !signup;
  $('authName').required = signup;
  $('authPhone').required = signup;
  $('email').placeholder = signup ? 'Gmail address' : 'Gmail or username';
  $('email').autocomplete = signup ? 'email' : 'username';
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('agreeField').hidden = !signup;
  $('authError').textContent = '';
  $('authAgree').checked = false;
  $('otpCode').required = false;
}

function openModal(nextMode = 'login') {
  setMode(nextMode);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  (nextMode === 'signup' ? $('authName') : $('email')).focus();
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function showOtp(email, message) {
  pendingEmail = email;
  authStep = 'otp';
  $('modal-title').textContent = 'Verify your account';
  $('credentialsFields').hidden = true;
  $('otpField').hidden = false;
  $('auth-switch').hidden = true;
  $('otpCode').required = true;
  $('otpHelp').textContent = message || 'Enter the 6-digit code sent to your mobile number.';
  $('submit-btn').textContent = 'Verify code';
  $('authError').textContent = '';
  $('otpCode').focus();
}

function clearSession() {
  state.token = '';
  state.user = null;
  state.orders = [];
  state.cart = { items: [], subtotal: 0 };
  state.promo = null;
  const hadProducts = Boolean($('store-grid').children.length);
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('Could not clear the saved login token.', error);
  }
  render();
  renderCart();
  if (hadProducts) loadProducts();
}

async function establishSession(data) {
  if (!data.token || !data.user) throw new Error('The server did not return a valid login session.');
  try {
    localStorage.setItem(TOKEN_KEY, data.token);
  } catch {
    throw new Error('Could not save your login on this device. Check browser storage settings and try again.');
  }
  state.token = data.token;
  state.user = data.user;
  if (state.user.role === 'admin') {
    window.location.assign(`${API_BASE}/admin`);
    return;
  }
  render();
  await loadCart();
  loadProducts();
  $('login-form').reset();
  closeModal();
  if (location.hash.startsWith('#account')) location.hash = '';
  const resumeCheckout = state.pendingCheckout;
  state.pendingCheckout = false;
  if (resumeCheckout) openCart('checkout');
  else showWelcome(data.user.username);
}

function openLogout() {
  $('logout-message').textContent = `You are logged in as ${state.user.email}. Do you want to log out?`;
  logoutModal.classList.add('open');
  logoutModal.setAttribute('aria-hidden', 'false');
  $('logout-cancel').focus();
}

function closeLogout() {
  logoutModal.classList.remove('open');
  logoutModal.setAttribute('aria-hidden', 'true');
  accountLink.focus();
}

async function restoreSession() {
  let token = '';
  try {
    token = localStorage.getItem(TOKEN_KEY) || '';
  } catch (error) {
    console.error('Could not read the saved login token.', error);
    return;
  }
  if (!token) return;

  state.token = token;
  try {
    const result = await api('/me');
    state.user = result.user;
    // Administrators go straight to the admin panel.
    if (state.user.role === 'admin') {
      window.location.replace(`${API_BASE}/admin`);
      return;
    }
    render();
  } catch (error) {
    if (error.status === 401) clearSession();
    else console.error('Could not restore the login session.', error);
  }
}

accountLink.addEventListener('click', (event) => {
  event.preventDefault();
  if (state.user) openLogout();
  else openModal('login');
});

$('switch-link').addEventListener('click', (event) => {
  event.preventDefault();
  setMode(mode === 'login' ? 'signup' : 'login');
});
$('modal-close').addEventListener('click', () => {
  state.pendingCheckout = false;
  closeModal();
});
modal.addEventListener('click', (event) => {
  if (event.target === modal) {
    state.pendingCheckout = false;
    closeModal();
  }
});

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('submit-btn');
  const errorBox = $('authError');
  errorBox.textContent = '';
  submit.disabled = true;
  try {
    if (authStep === 'otp') {
      const result = await api('/verify-otp', {
        method: 'POST',
        body: { email: pendingEmail, code: $('otpCode').value.trim() }
      });
      await establishSession(result);
      return;
    }

    if (mode === 'signup') {
      if (!$('authAgree').checked) {
        errorBox.textContent = 'Please agree to the Terms of Service and Privacy Policy.';
        return;
      }
      const result = await api('/signup', {
        method: 'POST',
        body: {
          username: $('authName').value.trim(),
          email: $('email').value.trim().toLowerCase(),
          phone: $('authPhone').value.trim(),
          password: $('password').value
        }
      });
      showOtp(result.email, result.message);
      return;
    }

    const result = await api('/login', {
      method: 'POST',
      body: {
        identifier: $('email').value.trim(),
        password: $('password').value
      }
    });
    await establishSession(result);
  } catch (error) {
    if (error.data && error.data.needs_otp && error.data.email) {
      showOtp(error.data.email, error.message);
    } else {
      errorBox.textContent = error.message;
    }
  } finally {
    submit.disabled = false;
  }
});

$('resend-otp').addEventListener('click', async () => {
  const button = $('resend-otp');
  button.disabled = true;
  $('authError').textContent = '';
  try {
    const result = await api('/resend-otp', {
      method: 'POST',
      body: { email: pendingEmail }
    });
    $('authError').textContent = result.message;
  } catch (error) {
    $('authError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('welcomeSkip').addEventListener('click', hideWelcome);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideWelcome();
    if (logoutModal.classList.contains('open')) closeLogout();
    if (modal.classList.contains('open')) closeModal();
  }
});
$('logout-cancel').addEventListener('click', closeLogout);
$('logout-confirm').addEventListener('click', () => {
  clearSession();
  closeLogout();
  if (location.hash.startsWith('#account')) {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
});
logoutModal.addEventListener('click', (event) => {
  if (event.target === logoutModal) closeLogout();
});

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderAccountProfile() {
  const user = state.user;
  if (!user) return;
  $('acc-avatar').textContent = (user.username || '?').charAt(0).toUpperCase();
  $('acc-name').textContent = user.username;
  $('acc-email').textContent = user.email;
  $('acc-role').hidden = user.role !== 'admin';
  const rows = [
    ['Username', user.username],
    ['Gmail', user.email],
    ['Mobile number', user.phone || 'Not added'],
    ['Account type', user.role === 'admin' ? 'Administrator' : 'Customer']
  ];
  $('acc-info').replaceChildren(...rows.map(([label, value]) => {
    const row = makeElement('div');
    row.append(makeElement('dt', '', label), makeElement('dd', '', value));
    return row;
  }));
}

function countOrders(status) {
  return state.orders.filter((order) => order.status === status).length;
}

function ordersForAccountFilter(filter) {
  if (filter === 'to-pay') return state.orders.filter((order) => order.status === 'pending');
  if (filter === 'to-ship') return state.orders.filter((order) => order.status === 'approved');
  if (filter === 'to-receive' || filter === 'to-review') return [];
  if (filter === 'declined') return state.orders.filter((order) => order.status === 'declined');
  return state.orders;
}

function renderAccountCounts() {
  const counts = {
    'to-pay': countOrders('pending'),
    'to-ship': countOrders('approved'),
    'to-receive': 0,
    'to-review': 0
  };
  Object.entries(counts).forEach(([stage, count]) => {
    $('acc-count-' + stage).textContent = accLoaded ? String(count) : '-';
  });
}

function orderCard(order) {
  const card = makeElement('article', 'account-order');
  const heading = makeElement('div', 'account-order-head');
  heading.append(makeElement('strong', '', `Order #${order.id}`));
  heading.append(makeElement('span', `badge ${order.status}`, order.status));
  card.append(heading);
  card.append(makeElement('p', 'account-order-date', order.created_at || ''));

  const items = makeElement('ul', 'account-order-items');
  (order.items || []).forEach((item) => {
    items.append(makeElement('li', '', `${item.name} × ${item.quantity}`));
  });
  card.append(items);
  card.append(makeElement('strong', 'account-order-total', `Total: ₱${Number(order.total || 0).toFixed(2)}`));
  return card;
}

function renderAccountOrders() {
  const filters = ['all', 'to-pay', 'to-ship', 'to-receive', 'to-review', 'declined'];
  const labels = {
    all: 'All',
    'to-pay': 'To pay',
    'to-ship': 'To ship',
    'to-receive': 'To receive',
    'to-review': 'To review',
    declined: 'Declined'
  };
  $('acc-order-chips').replaceChildren(...filters.map((filter) => {
    const count = filter === 'all' ? state.orders.length : ordersForAccountFilter(filter).length;
    const chip = makeElement('button', `chip${filter === accFilter ? ' active' : ''}`, `${labels[filter]} (${accLoaded ? count : 0})`);
    chip.type = 'button';
    chip.addEventListener('click', () => {
      location.hash = filter === 'all' ? 'account/orders' : `account/orders/${filter}`;
    });
    return chip;
  }));

  const list = $('acc-order-list');
  if (!accLoaded) {
    list.replaceChildren(makeElement('p', 'empty', accError || 'Loading your orders...'));
    return;
  }
  const orders = ordersForAccountFilter(accFilter);
  if (!orders.length) {
    const emptyMessage = {
      all: 'You have not placed any orders yet.',
      'to-pay': 'No orders are waiting for payment.',
      'to-ship': 'No approved orders are waiting to ship.',
      'to-receive': 'No orders are marked as shipped yet.',
      'to-review': 'No orders are ready for review yet.',
      declined: 'No declined orders.'
    };
    list.replaceChildren(makeElement('p', 'empty', accError || emptyMessage[accFilter] || emptyMessage.all));
    return;
  }
  list.replaceChildren(...orders.map(orderCard));
}

async function loadAccountOrders() {
  try {
    state.orders = await api('/orders');
    accLoaded = true;
    accError = '';
  } catch (error) {
    accLoaded = false;
    accError = `Could not load your orders: ${error.message}`;
  }
  renderAccountCounts();
  if (accView === 'orders') renderAccountOrders();
}

async function checkVoucher() {
  const badge = $('acc-voucher-status');
  badge.className = 'badge pending';
  badge.textContent = 'Checking...';
  try {
    const promo = await api('/promo', { method: 'POST', body: { code: 'QUAZAR20' } });
    badge.className = 'badge approved';
    badge.textContent = `Active: ${promo.discount_percent}% off`;
  } catch (error) {
    badge.className = 'badge declined';
    badge.textContent = error.message;
  }
}

$('acc-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('QUAZAR20');
    $('acc-message').textContent = 'Code QUAZAR20 copied.';
  } catch {
    $('acc-message').textContent = 'Could not copy automatically. The code is QUAZAR20.';
  }
});
$('acc-logout').addEventListener('click', openLogout);

function showAccountView(view, filter) {
  const availableViews = ['menu', 'orders', 'vouchers', 'settings'];
  const nextView = availableViews.includes(view) ? view : 'menu';
  const changed = nextView !== accView;
  availableViews.forEach((name) => {
    $('acc-view-' + name).hidden = name !== nextView;
  });
  accView = nextView;
  renderAccountProfile();
  renderAccountCounts();
  if (nextView === 'orders') {
    accFilter = ['all', 'to-pay', 'to-ship', 'to-receive', 'to-review', 'declined'].includes(filter) ? filter : 'all';
    renderAccountOrders();
  }
  if (nextView === 'vouchers' && changed) checkVoucher();
  if (changed) window.scrollTo(0, 0);
  loadAccountOrders();
  accTimer = setInterval(loadAccountOrders, 20000);
}

function route() {
  const parts = location.hash.slice(1).split('/');
  let onAccount = parts[0] === 'account';
  if (onAccount && !state.user) {
    onAccount = false;
    history.replaceState(null, '', location.pathname + location.search);
    openModal('login');
  }

  const wasOnAccount = !$('account-page').hidden;
  $('store-view').hidden = onAccount;
  $('account-page').hidden = !onAccount;
  document.body.classList.toggle('account-open', onAccount);
  clearInterval(accTimer);
  if (onAccount) {
    if (!wasOnAccount) {
      accLoaded = false;
      accView = '';
    }
    showAccountView(parts[1], parts[2]);
  } else {
    accView = '';
    if (wasOnAccount) {
      const target = document.getElementById(parts[0]);
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    }
  }
}
window.addEventListener('hashchange', route);

const infoModal = $('info-modal');
const infoPages = {
  about: {
    title: 'About Us',
    html: `<p>QuazarTech is a Quezon City-based store for useful tech and gadgets that make everyday routines better.</p>
           <p>Our demand-forecasting approach helps us understand what customers are looking for and plan our collection around emerging trends.</p>
           <p>Explore the latest arrivals and find gear for work, learning, and entertainment.</p>`
  },
  careers: {
    title: 'Careers',
    html: `<p>We’re always interested in hearing from people who care about technology and great customer experiences.</p>
           <p>Send a short introduction and your CV to <a href="mailto:support@quazartech.com">support@quazartech.com</a>.</p>
           <p><i>(EDIT: Confirm the preferred careers contact and current openings.)</i></p>`
  },
  privacy: {
    title: 'Privacy Policy',
    html: `<h4>Information you share</h4>
           <p>We may use the contact and delivery information you provide to respond to questions and process orders.</p>
           <h4>How we use information</h4>
           <p>We use relevant order and browsing activity to operate the store, improve the shopping experience, and understand product demand.</p>
           <h4>Your choices</h4>
           <p>For questions or requests about your information, contact <a href="mailto:support@quazartech.com">support@quazartech.com</a>.</p>
           <p><i>(EDIT: Have this policy reviewed and add the store’s data-retention and customer-rights procedures.)</i></p>`
  },
  terms: {
    title: 'Terms of Service',
    html: `<p>Product descriptions, availability, and prices may change. Prices are displayed in Philippine pesos.</p>
           <p>Use code QUAZAR20 for 20% off through October 31. The promotion may have eligibility requirements or exclusions; check the offer details before placing your order.</p>
           <p>Orders are subject to confirmation and product availability. Shipping, return, and warranty terms are described in their respective sections.</p>
           <p><i>(EDIT: Confirm promotion eligibility and exclusions, and have the complete terms reviewed.)</i></p>`
  },
  contact: {
    title: 'Contact Us',
    html: `<p><b>Location:</b> Cainta, Philippines</p>
           <p><b>Email:</b> <a href="mailto:support@quazartech.com">support@quazartech.com</a></p>
           <p><b>Phone:</b> <a href="tel:+639000000000">+63 900 000 0000</a></p>
           <p><b>Hours:</b> Monday to Saturday, 9am–6pm</p>`
  },
  shipping: {
    title: 'Shipping Information',
    html: `<p>Enjoy free shipping on orders over ₱2,000.</p>
           <p>Orders may be paid for using GCash or Cash on Delivery (COD), where available.</p>
           <p>Delivery timing and fees depend on your address. We’ll provide tracking information when your order ships.</p>
           <p><i>(EDIT: Add confirmed delivery estimates and shipping fees for orders under ₱2,000.)</i></p>`
  },
  returns: {
    title: 'Returns & Refunds',
    html: `<p>Contact us within 7 days of delivery if your order arrives damaged, incorrect, or otherwise needs attention. Include your order details and photos where relevant.</p>
           <p>We’ll review your request and confirm the available return or refund options. Please keep the item and its packaging until we respond.</p>
           <p><i>(EDIT: Confirm the 7-day return window, eligible conditions, exclusions, and refund processing time.)</i></p>`
  },
  warranty: {
    title: 'Warranty',
    html: `<p>QuazarTech products include a 1-year warranty against manufacturing defects. Keep your proof of purchase and contact us if you need help with a product issue.</p>
           <p>Email <a href="mailto:support@quazartech.com">support@quazartech.com</a> with your order details and a description of the issue.</p>
           <p><i>(EDIT: Confirm the 1-year warranty duration, coverage, and claim process for each product.)</i></p>`
  },
  faq: {
    title: 'Frequently Asked Questions',
    html: `<details><summary>Where is QuazarTech based?</summary><p>We’re based in Cainta, Philippines.</p></details>
           <details><summary>Is shipping free?</summary><p>Shipping is free for orders over ₱2,000. Fees may apply to orders below that amount.</p></details>
           <details><summary>What payment methods do you accept?</summary><p>GCash and COD, where available.</p></details>
           <details><summary>How do I use the QUAZAR20 promo?</summary><p>Enter QUAZAR20 at checkout for 20% off through October 31, subject to the promotion’s eligibility and exclusions.</p></details>
           <details><summary>How can I get help with an order?</summary><p>Email <a href="mailto:support@quazartech.com">support@quazartech.com</a> or call <a href="tel:+639000000000">+63 900 000 0000</a>.</p></details>`
  }
};

function openInfo(key) {
  const page = infoPages[key];
  if (!page) return;
  $('info-title').textContent = page.title;
  $('info-body').innerHTML = page.html;
  infoModal.classList.add('open');
  infoModal.setAttribute('aria-hidden', 'false');
  infoModal.querySelector('.info-box').scrollTop = 0;
}

function closeInfo() {
  infoModal.classList.remove('open');
  infoModal.setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('[data-info]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openInfo(link.dataset.info);
  });
});
$('info-close').addEventListener('click', closeInfo);
infoModal.addEventListener('click', (event) => {
  if (event.target === infoModal) closeInfo();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeInfo();
});

document.querySelectorAll('[data-shop]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const tab = document.querySelector(`#cat-strip .tab[data-filter="${link.dataset.shop}"]`);
    const applyFilter = () => {
      if (tab) tab.click();
      else $('products').scrollIntoView({ behavior: 'smooth' });
    };
    if (location.hash.startsWith('#account')) {
      location.hash = 'products';
      setTimeout(applyFilter, 0);
    } else {
      applyFilter();
    }
  });
});

$('newsletter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  $('newsletter-msg').textContent = 'Thanks for subscribing!';
  event.target.reset();
});

const strip = $('cat-strip');
let down = false;
let moved = false;
let startX = 0;
let startLeft = 0;

strip.addEventListener('mousedown', (event) => {
  down = true;
  moved = false;
  startX = event.pageX;
  startLeft = strip.scrollLeft;
});
window.addEventListener('mouseup', () => {
  down = false;
  strip.classList.remove('dragging');
});
window.addEventListener('mousemove', (event) => {
  if (!down) return;
  const dx = event.pageX - startX;
  if (Math.abs(dx) > 5) {
    moved = true;
    strip.classList.add('dragging');
  }
  strip.scrollLeft = startLeft - dx;
});
strip.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  if (moved) {
    event.stopPropagation();
    event.preventDefault();
    moved = false;
    return;
  }
  const filter = tab.dataset.filter;
  strip.querySelectorAll('.tab').forEach((item) => {
    const active = item === tab;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('#products .product-card').forEach((card) => {
    const categories = (card.dataset.category || '').split(/\s+/);
    card.hidden = filter !== 'all' && !categories.includes(filter);
  });
  $('products').scrollIntoView({ behavior: 'smooth' });
}, true);

// ---------- products ----------
const peso = (n) => '\u20B1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let storeNoticeTimer;

function savedGuestCart() {
  try {
    const entries = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    return Array.isArray(entries) ? entries.filter((entry) => Number(entry.product_id) > 0 && Number(entry.quantity) > 0) : [];
  } catch {
    return [];
  }
}

function saveGuestCart(entries) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(entries.map((entry) => ({
      product_id: Number(entry.product_id), quantity: Number(entry.quantity)
    }))));
  } catch {
    showStoreNotice('Could not save your cart in this browser.', true);
  }
}

function guestCartState() {
  const items = savedGuestCart().map((entry) => {
    const product = state.products.find((item) => item.id === Number(entry.product_id));
    if (!product || product.stock < 1) return null;
    return { product_id: product.id, quantity: Math.min(Number(entry.quantity), product.stock), name: product.name, price: product.price, image: product.image, stock: product.stock };
  }).filter(Boolean);
  return { items, subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0) };
}

function renderCartCount() {
  const button = $('cart-open');
  if (!button) return;
  const count = (state.cart.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  $('cart-count').textContent = count > 99 ? '99+' : String(count);
  $('cart-count').hidden = count === 0;
  button.setAttribute('aria-label', `Open cart, ${count} ${count === 1 ? 'item' : 'items'}`);
}

function renderCart() {
  const lines = $('cart-lines');
  if (!lines) return;
  const items = state.cart.items || [];
  if (!items.length) {
    lines.innerHTML = '<p class="cart-empty">Your cart is empty. Choose a product to get started.</p>';
  } else {
    lines.replaceChildren(...items.map((item) => {
      const row = makeElement('article', 'cart-line');
      const image = makeElement('img', 'cart-line-image');
      image.src = item.image || '';
      image.alt = item.name;
      image.hidden = !item.image;
      const details = makeElement('div', 'cart-line-details');
      details.append(makeElement('strong', '', item.name), makeElement('small', '', peso(item.price)));
      const quantity = makeElement('div', 'cart-quantity');
      const decrease = makeElement('button', '', '−');
      decrease.type = 'button';
      decrease.dataset.cartChange = '-1';
      decrease.dataset.productId = String(item.product_id);
      decrease.setAttribute('aria-label', `Decrease quantity of ${item.name}`);
      const amount = makeElement('span', '', String(item.quantity));
      const increase = makeElement('button', '', '+');
      increase.type = 'button';
      increase.dataset.cartChange = '1';
      increase.dataset.productId = String(item.product_id);
      increase.disabled = item.quantity >= item.stock;
      increase.setAttribute('aria-label', `Increase quantity of ${item.name}`);
      quantity.append(decrease, amount, increase);
      const remove = makeElement('button', 'cart-remove', 'Remove');
      remove.type = 'button';
      remove.dataset.cartRemove = String(item.product_id);
      row.append(image, details, quantity, remove);
      return row;
    }));
  }
  const count = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = Number(state.cart.subtotal || 0);
  const discount = state.promo ? Math.round(subtotal * state.promo.discount_percent) / 100 : 0;
  const total = Math.max(0, subtotal - discount);
  const headingCount = $('cart-heading-count');
  if (headingCount) headingCount.textContent = count ? `(${count})` : '';
  $('cart-subtotal').textContent = peso(subtotal);
  $('cart-discount-row').hidden = !state.promo;
  $('cart-discount').textContent = `−${peso(discount)}`;
  $('cart-total').textContent = peso(total);
  $('checkout-total').textContent = peso(total);
  $('cart-checkout').disabled = !items.length;
  renderCartCount();
}

async function loadCart() {
  if (state.user) {
    const guestItems = savedGuestCart();
    for (const item of guestItems) {
      await api('/cart', { method: 'POST', body: { product_id: item.product_id, quantity: item.quantity } });
    }
    try { localStorage.removeItem(GUEST_CART_KEY); } catch { /* Keep the server cart usable if storage is blocked. */ }
    state.cart = await api('/cart');
  } else {
    state.cart = guestCartState();
  }
  renderCart();
}

function showStoreNotice(message, isError = false) {
  const notice = $('store-notice');
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = false;
  clearTimeout(storeNoticeTimer);
  storeNoticeTimer = setTimeout(() => { notice.hidden = true; }, 4000);
}

function openCart(view = 'items') {
  const modal = $('cart-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('cart-open');
  $('cart-title').textContent = view === 'checkout' ? 'Checkout' : 'Your Cart';
  renderCart();
  $('cart-items-view').hidden = view !== 'items';
  $('checkout-form').hidden = view !== 'checkout';
  $('order-complete').hidden = true;
  if (view === 'checkout') {
    if (!state.user) {
      state.pendingCheckout = true;
      closeCart();
      openModal('login');
      $('authError').textContent = 'Log in or sign up to continue checkout. Your cart will be saved.';
      return;
    }
    $('shipping-name').value = state.user.username || '';
    $('shipping-phone').value = state.user.phone || '';
    $('shipping-address').focus();
  }
}

function closeCart() {
  $('cart-modal').classList.remove('open');
  $('cart-modal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('cart-open');
}

async function addProductToCart(productId, buyNow = false) {
  const product = state.products.find((item) => item.id === Number(productId));
  if (!product || product.stock < 1) return showStoreNotice('This product is out of stock.', true);
  try {
    if (state.user) {
      state.cart = await api('/cart', { method: 'POST', body: { product_id: product.id, quantity: 1 } });
    } else {
      const entries = savedGuestCart();
      const existing = entries.find((item) => Number(item.product_id) === product.id);
      if (existing) {
        if (Number(existing.quantity) >= product.stock) return showStoreNotice(`Only ${product.stock} available.`, true);
        existing.quantity = Number(existing.quantity) + 1;
      } else entries.push({ product_id: product.id, quantity: 1 });
      saveGuestCart(entries);
      state.cart = guestCartState();
    }
    renderCart();
    if (buyNow) openCart('checkout');
    else showStoreNotice(`${product.name} added to your cart.`);
  } catch (error) {
    showStoreNotice(error.message, true);
  }
}

async function changeCartQuantity(productId, change) {
  const current = state.cart.items.find((item) => item.product_id === Number(productId));
  if (!current) return;
  const quantity = Number(current.quantity) + Number(change);
  try {
    if (state.user) {
      state.cart = quantity < 1
        ? await api(`/cart/${productId}`, { method: 'DELETE' })
        : await api(`/cart/${productId}`, { method: 'PATCH', body: { quantity: Math.min(quantity, current.stock) } });
    } else {
      const entries = savedGuestCart().filter((item) => Number(item.product_id) !== Number(productId));
      if (quantity > 0) entries.push({ product_id: Number(productId), quantity: Math.min(quantity, current.stock) });
      saveGuestCart(entries);
      state.cart = guestCartState();
    }
    renderCart();
  } catch (error) {
    showStoreNotice(error.message, true);
  }
}

async function applyPromo(event) {
  event.preventDefault();
  const code = $('promo-code').value.trim();
  $('promo-message').textContent = '';
  if (!code) return $('promo-message').textContent = 'Enter a promo code.';
  if (!state.user) {
    $('promo-message').textContent = 'Log in before applying a promo code.';
    return;
  }
  try {
    state.promo = await api('/promo', { method: 'POST', body: { code } });
    $('promo-message').textContent = `${state.promo.discount_percent}% discount applied.`;
    renderCart();
  } catch (error) {
    state.promo = null;
    $('promo-message').textContent = error.message;
    renderCart();
  }
}

async function placeOrder(event) {
  event.preventDefault();
  const button = $('place-order');
  const errorBox = $('checkout-error');
  errorBox.textContent = '';
  button.disabled = true;
  try {
    const result = await api('/orders', {
      method: 'POST',
      body: {
        shipping_name: $('shipping-name').value.trim(),
        shipping_phone: $('shipping-phone').value.trim(),
        shipping_address: $('shipping-address').value.trim(),
        payment_method: new FormData($('checkout-form')).get('payment_method'),
        promo_code: state.promo?.code || ''
      }
    });
    state.cart = await api('/cart');
    state.promo = null;
    $('cart-items-view').hidden = true;
    $('checkout-form').hidden = true;
    $('order-complete').hidden = false;
    $('cart-title').textContent = 'Order placed';
    $('order-complete-message').textContent = `Your order #QZ-${result.order.id} was received. You can track its status in your account.`;
    renderCart();
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function filterTagsFor(product, newestIds) {
  const name = `${product.name} ${product.category_slug}`.toLowerCase();
  const tags = [];
  if (/earbud|earphone|headphone|airpod/.test(name)) tags.push('earbuds');
  if (/speaker/.test(name)) tags.push('speakers');
  if (/keyboard|mouse|peripheral/.test(name)) tags.push('keyboards');
  if (/phone/.test(name)) tags.push('phones');
  if (/laptop|tablet/.test(name)) tags.push('laptops');
  if (newestIds.has(product.id)) tags.push('trends');
  if (product.sold > 0) tags.push('forecast');
  return tags;
}

function productCard(product, tags) {
  const card = makeElement('article', 'product-card');
  card.dataset.category = tags.join(' ');
  const slot = makeElement('div', 'img-slot');
  if (product.image) {
    slot.classList.add('has-img');
    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.name;
    img.loading = 'lazy';
    slot.append(img);
  } else {
    slot.append(makeElement('span', '', 'No image'));
  }
  card.append(slot);
  if (product.brand) card.append(makeElement('small', 'brand', product.brand));
  card.append(makeElement('h4', '', product.name));
  card.append(makeElement('p', 'price', peso(product.price)));
  const rateLink = makeElement('button', 'rating-link');
  rateLink.innerHTML = product.review_count
    ? `<span class="rl-item">${ICON_STAR}<b>${Number(product.avg_rating).toFixed(1)}</b><small>(${Number(product.review_count)})</small></span><span class="rl-item">${ICON_COMMENT}<b>${Number(product.comment_count)}</b></span>`
    : `<span class="rl-item rl-empty">${ICON_STAR}Be the first to review</span>`;
  rateLink.type = 'button';
  rateLink.dataset.reviews = String(product.id);
  card.append(rateLink);
  if (product.stock < 1) card.append(makeElement('small', 'stock out', 'Out of stock'));
  else if (product.stock <= 5) card.append(makeElement('small', 'stock low', `Only ${product.stock} left`));
  if (product.members_only) card.append(makeElement('small', 'stock low', 'Members only'));
  const actions = makeElement('div', 'product-actions');
  const addButton = makeElement('button', 'add-cart-button', 'Add to cart');
  addButton.type = 'button';
  addButton.dataset.cartAdd = String(product.id);
  const buyButton = makeElement('button', 'buy-now-button', 'Buy now');
  buyButton.type = 'button';
  buyButton.dataset.buyNow = String(product.id);
  if (product.stock < 1) {
    addButton.disabled = true;
    buyButton.disabled = true;
  }
  actions.append(addButton, buyButton);
  card.append(actions);
  return card;
}

function applyProductFilter() {
  const filter = strip.querySelector('.tab.active')?.dataset.filter || 'all';
  document.querySelectorAll('#products .product-card').forEach((card) => {
    const categories = (card.dataset.category || '').split(/\s+/);
    card.hidden = filter !== 'all' && !categories.includes(filter);
  });
}

async function loadProducts() {
  let products;
  try {
    products = await api('/products');
  } catch (error) {
    console.error('Could not load products.', error);
    return;
  }
  state.products = products;
  const newest = new Set([...products].sort((a, b) => b.id - a.id).slice(0, 3).map((p) => p.id));
  $('store-grid').replaceChildren(...products.map((product) => productCard(product, filterTagsFor(product, newest))));
  applyProductFilter();
  renderCart();
}

$('cart-open').addEventListener('click', () => openCart());
$('cart-modal').addEventListener('click', (event) => {
  if (event.target.closest('[data-cart-close]')) closeCart();
});
$('store-grid').addEventListener('click', (event) => {
  const add = event.target.closest('[data-cart-add]');
  const buy = event.target.closest('[data-buy-now]');
  const reviewsBtn = event.target.closest('[data-reviews]');
  if (reviewsBtn) openReviews(reviewsBtn.dataset.reviews);
  if (add) addProductToCart(add.dataset.cartAdd);
  if (buy) addProductToCart(buy.dataset.buyNow, true);
});
$('cart-lines').addEventListener('click', (event) => {
  const change = event.target.closest('[data-cart-change]');
  const remove = event.target.closest('[data-cart-remove]');
  if (change) changeCartQuantity(change.dataset.productId, change.dataset.cartChange);
  if (remove) changeCartQuantity(remove.dataset.cartRemove, -Number(state.cart.items.find((item) => item.product_id === Number(remove.dataset.cartRemove))?.quantity || 0));
});
$('promo-form').addEventListener('submit', applyPromo);
$('cart-checkout').addEventListener('click', () => openCart('checkout'));
$('checkout-back').addEventListener('click', () => openCart());
$('checkout-form').addEventListener('submit', placeOrder);
$('complete-done').addEventListener('click', () => {
  closeCart();
  location.hash = 'products';
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('cart-modal').classList.contains('open')) closeCart();
});

// ---------- product ratings & comments ----------
const ICON_REPLY = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 9V5l-8 7 8 7v-4c5 0 8.5 1.5 11 5-1-6-4.5-10-11-11z" fill="currentColor"/></svg>';
const starText = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let reviewProductId = 0;
let reviewRating = 0;

async function openReviews(productId) {
  const product = state.products.find((p) => p.id === Number(productId));
  if (!product) return;
  reviewProductId = product.id;
  reviewRating = 0;
  $('info-title').textContent = `${product.name} – Reviews`;
  $('info-body').innerHTML = '<p>Loading reviews…</p>';
  infoModal.classList.add('open');
  infoModal.setAttribute('aria-hidden', 'false');
  await renderReviews();
}

function replyHtml(reply, reviewId) {
  return `<div class="rev-reply">
    <div class="rev-head">${ICON_REPLY} <b>${escapeHtml(reply.username)}</b>${reply.is_admin ? ' <span class="rev-admin">Admin</span>' : ''}
      <small>${escapeHtml(String(reply.created_at).slice(0, 10))}</small>
      <button type="button" class="rev-link" data-reply-to="${reviewId}" data-reply-name="${escapeHtml(reply.username)}">Reply</button>
      ${reply.mine ? `<button type="button" class="rev-del" data-reply-delete="${Number(reply.id)}">Delete</button>` : ''}</div>
    <p>${escapeHtml(reply.comment)}</p>
  </div>`;
}

async function renderReviews() {
  const body = $('info-body');
  let data;
  try {
    data = await api(`/products/${reviewProductId}/reviews`);
  } catch (error) {
    body.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }
  const mine = data.reviews.find((r) => r.mine);
  if (mine && !reviewRating) reviewRating = mine.rating;

  const summary = data.count
    ? `<p class="rev-summary"><span class="rev-stars">${starText(data.average)}</span> <b>${Number(data.average).toFixed(1)}</b> out of 5 · ${data.count} rating${data.count === 1 ? '' : 's'} · <span class="rev-cmt">${ICON_COMMENT} ${Number(data.comment_count)} comment${data.comment_count === 1 ? '' : 's'}</span></p>`
    : '<p class="rev-summary">No reviews yet. Be the first to share what you think!</p>';

  const form = state.user
    ? `<form id="review-form" class="rev-form">
         <h4>${mine ? 'Update your rating' : 'Rate this product'}</h4>
         <div class="rev-pick" id="rev-pick">${[1, 2, 3, 4, 5].map((n) =>
           `<button type="button" data-star="${n}" class="${n <= reviewRating ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
         <textarea id="rev-comment" maxlength="500" rows="3" placeholder="Share your experience with this product (optional)">${escapeHtml(mine ? mine.comment : '')}</textarea>
         <p class="rev-error" id="rev-error" role="alert"></p>
         <button type="submit" class="rev-submit">${mine ? 'Update review' : 'Post review'}</button>
       </form>`
    : '<p><button type="button" class="rev-submit" data-review-login>Log in to rate or comment</button></p>';

  const list = data.reviews.map((r) => `
    <div class="rev-item" data-review="${Number(r.id)}">
      <div class="rev-head"><span class="rev-stars">${starText(r.rating)}</span> <b>${escapeHtml(r.username)}</b>
        <small>${escapeHtml(String(r.created_at).slice(0, 10))}</small>
        ${r.mine ? `<button type="button" class="rev-del" data-review-delete="${Number(r.id)}">Delete</button>` : ''}</div>
      ${r.comment ? `<p class="rev-text"><span class="rev-cmt">${ICON_COMMENT}</span> ${escapeHtml(r.comment)}</p>` : ''}
      <div class="rev-replies">${r.replies.map((reply) => replyHtml(reply, r.id)).join('')}</div>
      <button type="button" class="rev-link" data-reply-to="${Number(r.id)}" data-reply-name="">${ICON_REPLY} Reply</button>
    </div>`).join('');

  body.innerHTML = summary + form + `<div class="rev-list">${list}</div>`;
}

$('info-body').addEventListener('click', async (event) => {
  const star = event.target.closest('[data-star]');
  if (star) {
    reviewRating = Number(star.dataset.star);
    document.querySelectorAll('#rev-pick button').forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= reviewRating));
    return;
  }
  if (event.target.closest('[data-review-login]')) {
    closeInfo();
    openModal('login');
    return;
  }
  const replyButton = event.target.closest('[data-reply-to]');
  if (replyButton) {
    if (!state.user) {
      closeInfo();
      openModal('login');
      return;
    }
    document.querySelectorAll('.reply-form').forEach((form) => form.remove());
    const item = replyButton.closest('.rev-item');
    const form = document.createElement('form');
    form.className = 'reply-form';
    form.dataset.reviewId = replyButton.dataset.replyTo;
    form.innerHTML = `<textarea maxlength="500" rows="2" placeholder="Write a reply…" required></textarea>
      <p class="rev-error" role="alert"></p>
      <button type="submit" class="rev-submit">Post reply</button>
      <button type="button" class="rev-link" data-reply-cancel>Cancel</button>`;
    item.append(form);
    const textarea = form.querySelector('textarea');
    if (replyButton.dataset.replyName) textarea.value = `@${replyButton.dataset.replyName} `;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    return;
  }
  if (event.target.closest('[data-reply-cancel]')) {
    event.target.closest('.reply-form').remove();
    return;
  }
  const deleteReply = event.target.closest('[data-reply-delete]');
  if (deleteReply && confirm('Delete your reply?')) {
    try {
      await api(`/replies/${deleteReply.dataset.replyDelete}`, { method: 'DELETE' });
      await renderReviews();
      loadProducts();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  const del = event.target.closest('[data-review-delete]');
  if (del && confirm('Delete your review and its replies?')) {
    try {
      await api(`/reviews/${del.dataset.reviewDelete}`, { method: 'DELETE' });
      reviewRating = 0;
      await renderReviews();
      loadProducts();
    } catch (error) {
      alert(error.message);
    }
  }
});

$('info-body').addEventListener('submit', async (event) => {
  if (event.target.classList.contains('reply-form')) {
    event.preventDefault();
    const form = event.target;
    const error = form.querySelector('.rev-error');
    try {
      await api(`/reviews/${form.dataset.reviewId}/replies`, {
        method: 'POST',
        body: { comment: form.querySelector('textarea').value }
      });
      await renderReviews();
      loadProducts();
    } catch (err) {
      error.textContent = err.message;
    }
    return;
  }
  if (event.target.id !== 'review-form') return;
  event.preventDefault();
  const error = $('rev-error');
  if (!reviewRating) {
    error.textContent = 'Please choose a rating from 1 to 5 stars.';
    return;
  }
  try {
    await api(`/products/${reviewProductId}/reviews`, {
      method: 'POST',
      body: { rating: reviewRating, comment: $('rev-comment').value }
    });
    await renderReviews();
    loadProducts();
  } catch (err) {
    error.textContent = err.message;
  }
});

(async function init() {
  await restoreSession();
  render();
  route();
  await loadProducts();
  await loadCart();
})();
