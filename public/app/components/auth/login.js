import BaseComponent from '../base-component.js';

class Login extends BaseComponent {
  connectedCallback() {
    this.render();
  }

  get mode() {
    return this.getAttribute('mode') === 'register' ? 'register' : 'login';
  }

  get workspaceRequired() {
    return this.hasAttribute('workspace-required');
  }

  render() {
    const registering = this.mode === 'register';
    this.innerHTML = `
      <main class="auth-screen">
        <section class="auth-panel" aria-labelledby="auth-title">
          <a class="auth-brand" href="/" aria-label="Agent Board home">
            <span class="brand-mark brand-mark--large" aria-hidden="true"><img src="/favicon.svg" alt=""></span>
            <span>Agent Board</span>
          </a>
          <div class="auth-heading">
            <div class="eyebrow">${registering ? 'Get started' : 'Welcome back'}</div>
            <h1 id="auth-title">${registering ? 'Create your account' : 'Sign in to your workspace'}</h1>
            <p>${registering ? 'Set up your profile and start planning with your team.' : 'Enter your details to continue to Agent Board.'}</p>
          </div>
          <div class="auth-tabs" role="tablist" aria-label="Authentication">
            <button type="button" role="tab" aria-selected="${!registering}" class="${!registering ? 'is-active' : ''}" data-auth-mode="login">Sign in</button>
            <button type="button" role="tab" aria-selected="${registering}" class="${registering ? 'is-active' : ''}" data-auth-mode="register">Register</button>
          </div>
          <form class="auth-form" data-auth-form="${this.mode}">
            ${registering ? `
              <label class="field"><span>Full name</span><input name="name" autocomplete="name" placeholder="Alex Rivera" minlength="2" maxlength="100" required></label>
              ${this.workspaceRequired ? '<label class="field"><span>Workspace name</span><input name="workspace_name" autocomplete="organization" placeholder="Acme Product Team" minlength="2" maxlength="100" required></label>' : ''}
            ` : ''}
            <label class="field"><span>Email address</span><input type="email" name="email" autocomplete="email" inputmode="email" placeholder="alex@example.com" maxlength="254" required></label>
            <label class="field"><span>Password</span><input type="password" name="password" autocomplete="${registering ? 'new-password' : 'current-password'}" placeholder="${registering ? 'At least 8 characters' : 'Enter your password'}" minlength="8" maxlength="128" required></label>
            ${registering ? '<label class="field"><span>Confirm password</span><input type="password" name="password_confirmation" autocomplete="new-password" placeholder="Repeat your password" minlength="8" maxlength="128" required></label>' : ''}
            <div class="auth-error" role="alert" data-auth-error hidden></div>
            <button class="button button--primary auth-submit" type="submit">${registering ? 'Create account' : 'Sign in'}</button>
          </form>
          <p class="auth-switch">${registering ? 'Already have an account?' : 'New to Agent Board?'} <button type="button" data-auth-mode="${registering ? 'login' : 'register'}">${registering ? 'Sign in' : 'Create an account'}</button></p>
        </section>
        <aside class="auth-aside" aria-hidden="true">
          <div class="auth-aside__glow"></div>
          <div class="auth-aside__content">
            <span class="auth-agent"><img src="/favicon.svg" alt=""></span>
            <p>Plan clearly. Ship confidently.</p>
            <h2>Your team’s work and AI agents, together in one focused workspace.</h2>
            <div class="auth-feature-list"><span>Projects</span><span>Issues</span><span>Agent activity</span></div>
          </div>
        </aside>
      </main>`;

    this.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => {
      const mode = button.dataset.authMode;
      history.replaceState({}, '', mode === 'register' ? '/register' : '/login');
      this.setAttribute('mode', mode);
      this.render();
    }));
    this.querySelector('[data-auth-form]').addEventListener('submit', (event) => this.handleSubmit(event));
    this.querySelector('input')?.focus();
  }

  async handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorElement = this.querySelector('[data-auth-error]');
    const submitButton = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    if (this.mode === 'register' && values.password !== values.password_confirmation) {
      errorElement.textContent = 'Passwords do not match.';
      errorElement.hidden = false;
      return;
    }
    delete values.password_confirmation;
    errorElement.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = this.mode === 'register' ? 'Creating account…' : 'Signing in…';
    try {
      const response = await fetch(this.mode === 'register' ? '/api/register' : '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Authentication failed.');
      this.dispatchEvent(new CustomEvent('auth-success', { bubbles: true, detail: result }));
    } catch (error) {
      errorElement.textContent = error.message || 'Unable to connect. Please try again.';
      errorElement.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = this.mode === 'register' ? 'Create account' : 'Sign in';
    }
  }
}

customElements.define('app-login', Login);

export default Login;
