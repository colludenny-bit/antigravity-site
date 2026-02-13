import React, { useState } from 'react';
import { Download, FileText, Image, Share2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

/**
 * Export Button Component
 * Allows users to export/screenshot dashboard sections
 */
export const ExportButton = ({ targetId, filename = 'karion-export', className }) => {
    const [showMenu, setShowMenu] = useState(false);
    const [exporting, setExporting] = useState(false);

    const handleScreenshot = async () => {
        setExporting(true);
        try {
            const element = targetId ? document.getElementById(targetId) : document.body;
            if (!element) {
                toast.error('Could not find element to export');
                return;
            }

            const canvas = await html2canvas(element, {
                backgroundColor: '#050505',
                scale: 2,
                logging: false,
                useCORS: true,
            });

            const link = document.createElement('a');
            link.download = `${filename}-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            toast.success('Screenshot saved!');
            setShowMenu(false);
        } catch (error) {
            console.error('Screenshot error:', error);
            toast.error('Failed to create screenshot');
        } finally {
            setExporting(false);
        }
    };

    const handleExportData = () => {
        // Export current page data as JSON
        const data = {
            exported: new Date().toISOString(),
            page: window.location.pathname,
            // Add more data as needed
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.download = `${filename}-data-${Date.now()}.json`;
        link.href = URL.createObjectURL(blob);
        link.click();

        toast.success('Data exported!');
        setShowMenu(false);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Karion Trading OS',
                    text: 'Check out my trading dashboard',
                    url: window.location.href,
                });
                toast.success('Shared!');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    toast.error('Failed to share');
                }
            }
        } else {
            // Fallback: copy URL to clipboard
            navigator.clipboard.writeText(window.location.href);
            toast.success('Link copied to clipboard!');
        }
        setShowMenu(false);
    };

    return (
        <div className={cn("relative", className)}>
            {/* Main Button */}
            <button
                onClick={() => setShowMenu(!showMenu)}
                disabled={exporting}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg",
                    "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#00D9A5]/30",
                    "text-sm font-medium text-white/80 hover:text-white",
                    "transition-all duration-200",
                    exporting && "opacity-50 cursor-not-allowed"
                )}
            >
                {exporting ? (
                    <>
                        <div className="w-4 h-4 border-2 border-[#00D9A5] border-t-transparent rounded-full animate-spin" />
                        <span>Exporting...</span>
                    </>
                ) : (
                    <>
                        <Download className="w-4 h-4" />
                        <span>Export</span>
                    </>
                )}
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {showMenu && !exporting && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-12 z-50 min-w-[200px]
                       bg-[#0a0d0d] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-1">
                            <button
                                onClick={handleScreenshot}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                           text-sm text-white/80 hover:text-white hover:bg-white/5
                           transition-colors"
                            >
                                <Image className="w-4 h-4 text-[#00D9A5]" />
                                <span>Screenshot (PNG)</span>
                            </button>

                            <button
                                onClick={handleExportData}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                           text-sm text-white/80 hover:text-white hover:bg-white/5
                           transition-colors"
                            >
                                <FileText className="w-4 h-4 text-blue-400" />
                                <span>Export Data (JSON)</span>
                            </button>

                            <div className="h-px bg-white/10 my-1" />

                            <button
                                onClick={handleShare}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                           text-sm text-white/80 hover:text-white hover:bg-white/5
                           transition-colors"
                            >
                                <Share2 className="w-4 h-4 text-violet-400" />
                                <span>Share Link</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Overlay to close menu */}
            {showMenu && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenu(false)}
                />
            )}
        </div>
    );
};

export default ExportButton;
