'use client';

// settings page - theme, language, editor width, daily notes
// ported from Notea (MIT License) - MUI replaced with Tailwind
import NotesProviders from '@/components/notes/providers';
import Sidebar from '@/components/notes/sidebar/sidebar';
import UIState from '@/lib/notes/state/ui';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { Locale, configLocale } from '@/locales';
import { EDITOR_SIZE } from '@/lib/notes/types/meta';

function SettingsUI() {
    const { t } = useI18n();
    const {
        split,
        ua,
        settings: { settings, updateSettings },
    } = UIState.useContainer();

    const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
        updateSettings({ theme });
    };

    const handleLocaleChange = (locale: Locale) => {
        updateSettings({ locale });
    };

    const handleEditorSizeChange = (editorsize: EDITOR_SIZE) => {
        updateSettings({ editorsize });
    };

    const settingsContent = (
        <section className="py-20 h-full overflow-y-auto">
            <div className="px-6 max-w-prose m-auto">
                <h1 className="font-normal text-4xl mb-10 text-text">
                    {t('Settings')}
                </h1>

                {/* basic settings */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-text mb-4">{t('Basic')}</h2>

                    {/* theme */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            {t('Theme')}
                        </label>
                        <div className="flex gap-2">
                            {(['system', 'light', 'dark'] as const).map((theme) => (
                                <button
                                    key={theme}
                                    onClick={() => handleThemeChange(theme)}
                                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                                        settings.theme === theme
                                            ? 'bg-primary-500 text-white'
                                            : 'bg-neutral-100 dark:bg-neutral-700 text-text-secondary hover:bg-neutral-200 dark:hover:bg-neutral-600'
                                    }`}
                                >
                                    {t(theme.charAt(0).toUpperCase() + theme.slice(1))}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* language */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            {t('Language')}
                        </label>
                        <select
                            value={settings.locale || Locale.EN}
                            onChange={(e) => handleLocaleChange(e.target.value as Locale)}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            {Object.entries(configLocale).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

                    {/* editor width */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            {t('Editor width')}
                        </label>
                        <div className="flex gap-2">
                            {([EDITOR_SIZE.SMALL, EDITOR_SIZE.LARGE] as const).map((size) => (
                                <button
                                    key={size}
                                    onClick={() => handleEditorSizeChange(size)}
                                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                                        settings.editorsize === size
                                            ? 'bg-primary-500 text-white'
                                            : 'bg-neutral-100 dark:bg-neutral-700 text-text-secondary hover:bg-neutral-200 dark:hover:bg-neutral-600'
                                    }`}
                                >
                                    {size === EDITOR_SIZE.SMALL ? t('Small') : t('Large')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <hr className="my-10 border-border" />

                {/* import & export */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-text mb-2">{t('Import & Export')}</h2>
                    <p className="text-sm text-text-tertiary mb-4">
                        {t('Import a zip file containing markdown files to this location, or export all pages from this location.')}
                    </p>
                    <div className="flex gap-3">
                        <button
                            disabled
                            className="px-4 py-2 rounded-lg text-sm bg-neutral-100 dark:bg-neutral-700 text-text-tertiary cursor-not-allowed"
                            title="Coming soon"
                        >
                            {t('Import')}
                        </button>
                        <button
                            disabled
                            className="px-4 py-2 rounded-lg text-sm bg-neutral-100 dark:bg-neutral-700 text-text-tertiary cursor-not-allowed"
                            title="Coming soon"
                        >
                            {t('Export')}
                        </button>
                    </div>
                </div>

                <hr className="my-10 border-border" />

                {/* footer */}
                <footer className="pb-10 text-neutral-400 text-center text-sm">
                    Powered by{' '}
                    <a
                        href="https://github.com/notea-org/notea"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-500 hover:underline"
                    >
                        Notea
                    </a>
                    {' '}engine, adapted for SocsBoard
                </footer>
            </div>
        </section>
    );

    if (ua?.isMobileOnly) {
        return (
            <div className="flex h-screen bg-background">
                <Sidebar />
                <div className="flex-1 overflow-auto bg-surface">
                    {settingsContent}
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-background">
            <Allotment
                defaultSizes={split.sizes}
                onChange={(sizes) => {
                    split.saveSizes(sizes as [number, number]);
                }}
            >
                <Allotment.Pane minSize={200} maxSize={600}>
                    <div className="h-full bg-surface border-r border-border">
                        <Sidebar />
                    </div>
                </Allotment.Pane>
                <Allotment.Pane>
                    <div className="h-full bg-surface">
                        {settingsContent}
                    </div>
                </Allotment.Pane>
            </Allotment>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <NotesProviders>
            <SettingsUI />
        </NotesProviders>
    );
}
