import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Keyboard Shortcuts Helper Component
 * Displays available keyboard shortcuts and handles navigation
 */
const shortcuts = [
    { key: '/', description: 'Focus search', category: 'Navigation' },
    { key: 'g h', description: 'Go to Dashboard', category: 'Navigation' },
    { key: 'g c', description: 'Go to Crypto', category: 'Navigation' },
    { key: 'g n', description: 'Go to News', category: 'Navigation' },
    { key: 'g s', description: 'Go to Strategy', category: 'Navigation' },
    { key: '?', description: 'Show this help', category: 'General' },
    { key: 'Esc', description: 'Close dialogs', category: 'General' },
    { key: 'r', description: 'Refresh data', category: 'Actions' },
    { key: 'Cmd/Ctrl + K', description: 'Command palette', category: 'Actions' },
];

export const KeyboardShortcuts = ({ onNavigate }) => {
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        let gPressed = false;
        let gTimeout;

        const handleKeyDown = (e) => {
            // Ignore if user is typing in an input
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            // Show help with ?
            if (e.key === '?' && !e.shiftKey) {
                e.preventDefault();
                setShowHelp(prev => !prev);
                return;
            }

            // Close dialogs with Escape
            if (e.key === 'Escape') {
                setShowHelp(false);
                return;
            }

            // Handle 'g' prefix for navigation
            if (e.key === 'g' && !gPressed) {
                gPressed = true;
                gTimeout = setTimeout(() => {
                    gPressed = false;
                }, 1000);
                return;
            }

            if (gPressed) {
                e.preventDefault();
                clearTimeout(gTimeout);
                gPressed = false;

                const navMap = {
                    'h': '/',
                    'c': '/crypto',
                    'n': '/news',
                    's': '/strategy',
                    'm': '/macro',
                    'r': '/risk',
                    'a': '/ai',
                };

                if (navMap[e.key] && onNavigate) {
                    onNavigate(navMap[e.key]);
                }
            }

            // Refresh data with 'r'
            if (e.key === 'r' && !gPressed && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                window.location.reload();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            clearTimeout(gTimeout);
        };
    }, [onNavigate]);

    return (
        <>
            {/* Help Button */}
            <button
                onClick={() => setShowHelp(true)}
                className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-white/5 hover:bg-white/10 
                   border border-white/10 hover:border-[#00D9A5]/30 transition-all group"
                title="Keyboard Shortcuts (?)"
            >
                <Keyboard className="w-5 h-5 text-white/50 group-hover:text-[#00D9A5]" />
            </button>

            {/* Help Modal */}
            <AnimatePresence>
                {showHelp && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowHelp(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                         w-full max-w-2xl max-h-[80vh] overflow-auto
                         bg-[#0a0d0d] border border-[#00D9A5]/20 rounded-2xl shadow-2xl"
                        >
                            {/* Header */}
                            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-white/10 bg-[#0a0d0d]">
                                <div className="flex items-center gap-3">
                                    <Keyboard className="w-6 h-6 text-[#00D9A5]" />
                                    <h2 className="text-xl font-semibold text-white">Keyboard Shortcuts</h2>
                                </div>
                                <button
                                    onClick={() => setShowHelp(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-5 h-5 text-white/50" />
                                </button>
                            </div>

                            {/* Shortcuts List */}
                            <div className="p-6 space-y-6">
                                {['Navigation', 'Actions', 'General'].map(category => {
                                    const categoryShortcuts = shortcuts.filter(s => s.category === category);
                                    if (categoryShortcuts.length === 0) return null;

                                    return (
                                        <div key={category}>
                                            <h3 className="text-sm font-medium text-white/50 uppercase tracking-wide mb-3">
                                                {category}
                                            </h3>
                                            <div className="space-y-2">
                                                {categoryShortcuts.map((shortcut, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex items-center justify-between py-2 px-3 rounded-lg
                                       bg-white/5 hover:bg-white/8 transition-colors"
                                                    >
                                                        <span className="text-sm text-white/80">{shortcut.description}</span>
                                                        <div className="flex gap-1">
                                                            {shortcut.key.split(' ').map((key, j) => (
                                                                <kbd
                                                                    key={j}
                                                                    className="px-2 py-1 text-xs font-medium text-[#00D9A5] bg-[#00D9A5]/10
                                             border border-[#00D9A5]/20 rounded shadow-sm"
                                                                >
                                                                    {key}
                                                                </kbd>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer */}
                            <div className="p-4 border-t border-white/10 bg-white/5">
                                <p className="text-xs text-center text-white/40">
                                    Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60">?</kbd> to toggle this help
                                </p>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default KeyboardShortcuts;
