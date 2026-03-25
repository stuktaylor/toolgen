import React, { useEffect, useState } from 'https://esm.sh/react@19.2.0?dev';
import { createRoot } from 'https://esm.sh/react-dom@19.2.0/client?dev';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(React.createElement);

function emptyDraft() {
  return { toolId: null, name: '', prompt: '', html: '', isShared: false };
}

async function requestJson(url, options = {}) {
  const settings = { ...options };
  settings.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (settings.body && typeof settings.body !== 'string') {
    settings.body = JSON.stringify(settings.body);
  }
  const response = await fetch(url, settings);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

function openToolPreview(sourceHtml) {
  const blob = new Blob([sourceHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function FieldLabel({ children }) {
  return html`<label className="mb-2 block text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
    ${children}
  </label>`;
}

function MessageBar({ error, notice }) {
  if (!error && !notice) {
    return null;
  }
  const tone = error
    ? 'border-coral/20 bg-coral/10 text-rose-900'
    : 'border-pine/20 bg-pine/10 text-pine';
  return html`<div className=${`rounded-2xl border px-4 py-3 text-sm ${tone}`}>${error || notice}</div>`;
}

function LoginView({ form, onChange, onSubmit, working }) {
  return html`
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6">
      <section className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-panel backdrop-blur lg:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-ember">Toolsgen</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Turn plain-English tool requests into working internal apps.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Log in with your email and password. New addresses are created automatically, then you can generate,
            preview, publish, and iterate on small tools for your team.
          </p>
        </div>
        <form className="rounded-[2rem] border border-white/80 bg-white/95 p-8 shadow-panel" onSubmit=${onSubmit}>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-2 text-sm text-slate-600">Use any email and password to create or resume your workspace.</p>
          <div className="mt-8">
            <${FieldLabel}>Email<//>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-pine focus:ring-2 focus:ring-pine/20"
              type="email"
              name="email"
              value=${form.email}
              onInput=${onChange}
              placeholder="alex@company.com"
              required
            />
          </div>
          <div className="mt-5">
            <${FieldLabel}>Password<//>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-pine focus:ring-2 focus:ring-pine/20"
              type="password"
              name="password"
              value=${form.password}
              onInput=${onChange}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            type="submit"
            disabled=${working}
          >
            ${working ? 'Signing In...' : 'Enter Toolsgen'}
          </button>
        </form>
      </section>
    </main>
  `;
}

function LibraryCard({ tool, deleting, onDelete, onEdit, onOpen }) {
  const cardClassName = [
    'cursor-pointer rounded-[1.75rem] border border-white/80 bg-white/95 p-5 shadow-panel transition hover:-translate-y-0.5 hover:border-pine/40',
  ].join(' ');

  return html`
    <article
      className=${cardClassName}
      onClick=${() => onOpen(tool.id)}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
            ${tool.isOwned ? 'Your Tool' : 'Shared Tool'}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-ink">${tool.name}</h3>
        </div>
        ${tool.isShared
          ? html`<span className="rounded-full bg-pine/10 px-3 py-1 text-xs font-semibold text-pine">Shared</span>`
          : null}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">${tool.prompt}</p>
      ${tool.isOwned
        ? html`<div className="mt-5 flex flex-wrap gap-3">
            <button
              className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink transition hover:border-pine hover:text-pine"
              type="button"
              onClick=${(event) => {
                event.stopPropagation();
                onEdit(tool.id);
              }}
            >
              Edit
            </button>
            <button
              className="inline-flex items-center rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-500 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled=${deleting}
              onClick=${(event) => {
                event.stopPropagation();
                onDelete(tool);
              }}
            >
              ${deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>`
        : null}
      <p className="mt-5 text-sm font-medium text-pine">Click to open in a new tab</p>
    </article>
  `;
}

function LibraryView({ user, tools, loading, deletingToolId, onCreate, onDelete, onEdit, onLogout, onOpen }) {
  return html`
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-panel backdrop-blur sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-ember">Library</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back, ${user.email}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Generate new tools, revisit earlier work, or edit tools you created. Shared tools remain visible to everyone.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              type="button"
              onClick=${onCreate}
            >
              Generate New Tool
            </button>
            <button
              className="inline-flex items-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-ink transition hover:border-coral hover:text-coral"
              type="button"
              onClick=${onLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Saved Tools</h2>
          <span className="text-sm text-slate-500">${loading ? 'Refreshing...' : `${tools.length} loaded`}</span>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          ${tools.length
            ? tools.map(
                (tool) => html`<${LibraryCard}
                  key=${tool.id}
                  tool=${tool}
                  deleting=${deletingToolId === tool.id}
                  onDelete=${onDelete}
                  onEdit=${onEdit}
                  onOpen=${onOpen}
                />`
              )
            : html`<div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/70 p-8 text-sm text-slate-600">
                No tools yet. Start with “Generate New Tool” to create your first one.
              </div>`}
        </div>
      </section>
    </main>
  `;
}

function PreviewPane({ draft, onOpenNewTab }) {
  return html`
    <section className="rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Live Preview</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">${draft.name || 'Generated Tool Preview'}</h2>
        </div>
        <button
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-ink transition hover:border-pine hover:text-pine disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick=${onOpenNewTab}
          disabled=${!draft.html}
        >
          Open in new tab
        </button>
      </div>
      <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100">
        ${draft.html
          ? html`<iframe className="h-[34rem] w-full bg-white" title="Tool preview" srcDoc=${draft.html}></iframe>`
          : html`<div className="flex h-[34rem] items-center justify-center px-6 text-center text-sm text-slate-500">
              Generated tools appear here after you click “Generate Tool”.
            </div>`}
      </div>
    </section>
  `;
}

function BuilderView({ draft, working, onChange, onGenerate, onPublish, onReturn, onOpenNewTab }) {
  return html`
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex justify-end">
        <button
          className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-5 py-3 text-sm font-semibold text-ink shadow-sm transition hover:border-pine hover:text-pine"
          type="button"
          onClick=${onReturn}
        >
          Return to library
        </button>
      </div>
      <section className="mt-5 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Prompt Input</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Describe the tool you want to build.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Write the business problem in plain English. Codex returns a single HTML app that you can preview instantly.
          </p>
          <div className="mt-6">
            <${FieldLabel}>Prompt<//>
            <textarea
              className="min-h-[18rem] w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-7 outline-none transition focus:border-pine focus:bg-white focus:ring-2 focus:ring-pine/20"
              name="prompt"
              value=${draft.prompt}
              onInput=${onChange}
              placeholder="Example: Build a shift handover tool for the warehouse team with a checklist, notes, and a daily summary."
              required
            ></textarea>
          </div>
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-pine"
              id="share-app"
              type="checkbox"
              name="isShared"
              checked=${draft.isShared}
              onChange=${onChange}
            />
            <label className="text-sm font-medium text-slate-700" htmlFor="share-app">
              Share Application
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              type="button"
              onClick=${onGenerate}
              disabled=${working || !draft.prompt.trim()}
            >
              ${working === 'generate' ? 'Generating...' : 'Generate Tool'}
            </button>
            <button
              className="inline-flex items-center rounded-full bg-pine px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-300"
              type="button"
              onClick=${onPublish}
              disabled=${working || !draft.html}
            >
              ${working === 'publish' ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>
        <${PreviewPane} draft=${draft} onOpenNewTab=${onOpenNewTab} />
      </section>
    </main>
  `;
}

function App() {
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [draft, setDraft] = useState(emptyDraft());
  const [user, setUser] = useState(null);
  const [tools, setTools] = useState([]);
  const [view, setView] = useState('library');
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadLibrary() {
    setLoadingLibrary(true);
    try {
      const data = await requestJson('/api/tools');
      setTools(data.tools);
    } finally {
      setLoadingLibrary(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const data = await requestJson('/api/session');
        if (!active) {
          return;
        }
        setUser(data.user);
        await loadLibrary();
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoadingSession(false);
        }
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  function updateDraft(event) {
    const { name, value, checked, type } = event.target;
    setDraft((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  function updateAuthForm(event) {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setWorking('login');
    try {
      const data = await requestJson('/api/session/login', { method: 'POST', body: authForm });
      setUser(data.user);
      setView('library');
      await loadLibrary();
      setNotice('Signed in successfully.');
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setWorking('');
      setLoadingSession(false);
    }
  }

  async function handleLogout() {
    setError('');
    setNotice('');
    try {
      await requestJson('/api/session/logout', { method: 'POST' });
    } catch {
      return;
    }
    setUser(null);
    setTools([]);
    setDraft(emptyDraft());
    setAuthForm({ email: '', password: '' });
  }

  function startNewTool() {
    setError('');
    setNotice('');
    setDraft(emptyDraft());
    setView('builder');
  }

  async function editTool(toolId) {
    setError('');
    setNotice('');
    try {
      const data = await requestJson(`/api/tools/${toolId}`);
      setDraft({
        toolId: data.tool.id,
        name: data.tool.name,
        prompt: data.tool.prompt,
        html: data.tool.html,
        isShared: data.tool.isShared,
      });
      setView('builder');
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  async function openSharedTool(toolId) {
    setError('');
    setNotice('');
    try {
      const data = await requestJson(`/api/tools/${toolId}`);
      openToolPreview(data.tool.html);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  async function handleGenerate() {
    setError('');
    setNotice('');
    setWorking('generate');
    try {
      const data = await requestJson('/api/tools/generate', {
        method: 'POST',
        body: { prompt: draft.prompt },
      });
      setDraft((current) => ({ ...current, html: data.html, name: data.name || current.name }));
      setNotice('Preview updated from the latest generated tool.');
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setWorking('');
    }
  }

  async function handlePublish() {
    setError('');
    setNotice('');
    setWorking('publish');
    try {
      const data = await requestJson('/api/tools/publish', {
        method: 'POST',
        body: draft,
      });
      setDraft((current) => ({
        ...current,
        toolId: data.tool.id,
        name: data.tool.name,
      }));
      await loadLibrary();
      setView('library');
      setNotice('Tool saved to your library.');
    } catch (publishError) {
      setError(publishError.message);
    } finally {
      setWorking('');
    }
  }

  async function handleDelete(tool) {
    const confirmed = window.confirm(`Delete "${tool.name}" from every library?`);
    if (!confirmed) {
      return;
    }

    setError('');
    setNotice('');
    setWorking(`delete-${tool.id}`);
    try {
      await requestJson(`/api/tools/${tool.id}`, { method: 'DELETE' });
      setTools((current) => current.filter((item) => item.id !== tool.id));
      setDraft((current) => (current.toolId === tool.id ? emptyDraft() : current));
      if (view !== 'library') {
        setView('library');
      }
      setNotice('Tool deleted from every library.');
      loadLibrary().catch(() => {});
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setWorking('');
    }
  }

  function handleOpenNewTab() {
    if (draft.html) {
      openToolPreview(draft.html);
    }
  }

  if (loadingSession) {
    return html`<main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-4">
      <div className="rounded-[2rem] border border-white/80 bg-white/90 px-6 py-5 text-sm font-medium text-slate-600 shadow-panel">
        Loading your workspace...
      </div>
    </main>`;
  }

  return html`
    <div className="pb-10">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <${MessageBar} error=${error} notice=${notice} />
      </div>
      ${user
        ? view === 'library'
          ? html`<${LibraryView}
              user=${user}
              tools=${tools}
              loading=${loadingLibrary}
              deletingToolId=${working.startsWith('delete-') ? Number(working.slice(7)) : null}
              onCreate=${startNewTool}
              onDelete=${handleDelete}
              onEdit=${editTool}
              onLogout=${handleLogout}
              onOpen=${openSharedTool}
            />`
          : html`<${BuilderView}
              draft=${draft}
              working=${working}
              onChange=${updateDraft}
              onGenerate=${handleGenerate}
              onPublish=${handlePublish}
              onReturn=${() => setView('library')}
              onOpenNewTab=${handleOpenNewTab}
            />`
        : html`<${LoginView}
            form=${authForm}
            onChange=${updateAuthForm}
            onSubmit=${handleLogin}
            working=${working === 'login'}
          />`}
    </div>
  `;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
