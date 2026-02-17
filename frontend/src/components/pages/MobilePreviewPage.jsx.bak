import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

const DEVICES = {
    'iPhone 15 Pro': { width: 393, height: 852, radius: 55, notch: 'dynamic-island' },
    'iPhone SE': { width: 375, height: 667, radius: 38, notch: 'none' },
    'iPhone 15 Pro Max': { width: 430, height: 932, radius: 55, notch: 'dynamic-island' },
    'iPad Mini': { width: 744, height: 1133, radius: 18, notch: 'none' },
};

const SCALE_FOR_SCREEN = 0.65; // scale down so it fits nicely

export default function MobilePreviewPage() {
    const [selectedDevice, setSelectedDevice] = useState('iPhone 15 Pro');
    const [url, setUrl] = useState('/auth');
    const [inputUrl, setInputUrl] = useState('/auth');
    const iframeRef = useRef(null);

    const device = DEVICES[selectedDevice];
    const scaledW = device.width * SCALE_FOR_SCREEN;
    const scaledH = device.height * SCALE_FOR_SCREEN;

    const navigate = (path) => {
        setUrl(path);
        setInputUrl(path);
    };

    const quickLinks = [
        { label: 'Auth', path: '/auth' },
        { label: 'Dashboard', path: '/app' },
        { label: 'Pricing', path: '/pricing' },
        { label: 'Welcome', path: '/welcome' },
        { label: 'Settings', path: '/app/settings' },
        { label: 'Crypto', path: '/app/crypto' },
        { label: 'News', path: '/app/news' },
        { label: 'COT', path: '/app/cot' },
    ];

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)',
            display: 'flex',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        }}>
            {/* Left Panel — Controls */}
            <div style={{
                width: 280,
                padding: '24px 20px',
                borderRight: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                flexShrink: 0,
            }}>
                <div>
                    <h1 style={{
                        color: '#fff',
                        fontSize: 18,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        margin: 0,
                    }}>
                        📱 Mobile Preview
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
                        Karion Trading OS — Dev Tool
                    </p>
                </div>

                {/* Device Selector */}
                <div>
                    <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Device
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                        {Object.keys(DEVICES).map((name) => (
                            <button
                                key={name}
                                onClick={() => setSelectedDevice(name)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: selectedDevice === name ? 600 : 400,
                                    background: selectedDevice === name
                                        ? 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)'
                                        : 'rgba(255,255,255,0.05)',
                                    color: selectedDevice === name ? '#000' : 'rgba(255,255,255,0.7)',
                                    textAlign: 'left',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {name}
                                <span style={{
                                    float: 'right',
                                    opacity: 0.5,
                                    fontSize: 11,
                                }}>
                                    {DEVICES[name].width}×{DEVICES[name].height}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* URL Bar */}
                <div>
                    <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Navigate
                    </label>
                    <form onSubmit={(e) => { e.preventDefault(); setUrl(inputUrl); }} style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <input
                                value={inputUrl}
                                onChange={(e) => setInputUrl(e.target.value)}
                                placeholder="/app"
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: '#fff',
                                    fontSize: 13,
                                    outline: 'none',
                                }}
                            />
                            <button
                                type="submit"
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: '#00d4aa',
                                    color: '#000',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                }}>
                                Go
                            </button>
                        </div>
                    </form>
                </div>

                {/* Quick Links */}
                <div>
                    <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Quick Links
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {quickLinks.map((link) => (
                            <button
                                key={link.path}
                                onClick={() => navigate(link.path)}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: url === link.path ? 'rgba(0,212,170,0.15)' : 'transparent',
                                    color: url === link.path ? '#00d4aa' : 'rgba(255,255,255,0.5)',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {link.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Info */}
                <div style={{
                    marginTop: 'auto',
                    padding: '12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                        💡 This is a dev-only tool. The iframe loads your live app at the selected mobile viewport size.
                    </p>
                </div>
            </div>

            {/* Right Panel — Phone */}
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
            }}>
                <motion.div
                    key={selectedDevice}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', duration: 0.5 }}
                >
                    {/* iPhone Frame */}
                    <div style={{
                        width: scaledW + 24,
                        height: scaledH + 24,
                        borderRadius: device.radius * SCALE_FOR_SCREEN + 8,
                        background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #111 100%)',
                        padding: 12,
                        boxShadow: `
              0 0 0 1px rgba(255,255,255,0.08),
              0 20px 60px rgba(0,0,0,0.6),
              0 0 80px rgba(0,212,170,0.05),
              inset 0 1px 0 rgba(255,255,255,0.1)
            `,
                        position: 'relative',
                    }}>
                        {/* Dynamic Island */}
                        {device.notch === 'dynamic-island' && (
                            <div style={{
                                position: 'absolute',
                                top: 12 + 10 * SCALE_FOR_SCREEN,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 120 * SCALE_FOR_SCREEN,
                                height: 36 * SCALE_FOR_SCREEN,
                                background: '#000',
                                borderRadius: 20 * SCALE_FOR_SCREEN,
                                zIndex: 10,
                                boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
                            }} />
                        )}

                        {/* Side Button (Power) */}
                        <div style={{
                            position: 'absolute',
                            right: -3,
                            top: 120 * SCALE_FOR_SCREEN,
                            width: 3,
                            height: 60 * SCALE_FOR_SCREEN,
                            background: '#333',
                            borderRadius: '0 2px 2px 0',
                        }} />

                        {/* Volume Buttons */}
                        <div style={{
                            position: 'absolute',
                            left: -3,
                            top: 100 * SCALE_FOR_SCREEN,
                            width: 3,
                            height: 30 * SCALE_FOR_SCREEN,
                            background: '#333',
                            borderRadius: '2px 0 0 2px',
                        }} />
                        <div style={{
                            position: 'absolute',
                            left: -3,
                            top: 140 * SCALE_FOR_SCREEN,
                            width: 3,
                            height: 30 * SCALE_FOR_SCREEN,
                            background: '#333',
                            borderRadius: '2px 0 0 2px',
                        }} />

                        {/* Screen */}
                        <div style={{
                            width: scaledW,
                            height: scaledH,
                            borderRadius: device.radius * SCALE_FOR_SCREEN,
                            overflow: 'hidden',
                            background: '#000',
                            position: 'relative',
                        }}>
                            {/* Status Bar - transparent, sits beside Dynamic Island like real iPhone */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: 54 * SCALE_FOR_SCREEN,
                                zIndex: 5,
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                padding: `${14 * SCALE_FOR_SCREEN}px ${20 * SCALE_FOR_SCREEN}px 0`,
                                pointerEvents: 'none',
                            }}>
                                <span style={{ color: '#fff', fontSize: 11 * SCALE_FOR_SCREEN, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                                    {new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                    <span style={{ color: '#fff', fontSize: 9 * SCALE_FOR_SCREEN, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>5G</span>
                                    <span style={{ color: '#fff', fontSize: 9 * SCALE_FOR_SCREEN, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>📶</span>
                                    <span style={{ color: '#fff', fontSize: 9 * SCALE_FOR_SCREEN, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>🔋</span>
                                </div>
                            </div>

                            {/* Iframe */}
                            <iframe
                                ref={iframeRef}
                                src={`http://localhost:3000${url}`}
                                title="Mobile Preview"
                                style={{
                                    width: device.width,
                                    height: device.height,
                                    border: 'none',
                                    transform: `scale(${SCALE_FOR_SCREEN})`,
                                    transformOrigin: 'top left',
                                }}
                            />

                            {/* Home Indicator */}
                            {device.notch === 'dynamic-island' && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 8 * SCALE_FOR_SCREEN,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 134 * SCALE_FOR_SCREEN,
                                    height: 5 * SCALE_FOR_SCREEN,
                                    background: 'rgba(255,255,255,0.3)',
                                    borderRadius: 3 * SCALE_FOR_SCREEN,
                                }} />
                            )}
                        </div>
                    </div>

                    {/* Device Label */}
                    <p style={{
                        textAlign: 'center',
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: 12,
                        marginTop: 16,
                        fontWeight: 500,
                    }}>
                        {selectedDevice} — {device.width}×{device.height} @ {Math.round(SCALE_FOR_SCREEN * 100)}%
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
