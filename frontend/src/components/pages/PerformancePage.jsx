import React, { useState } from 'react';
import {
    TrendingUp,
    TrendingDown,
    BarChart3,
    Target,
    AlertTriangle,
    CheckCircle,
    XCircle,
    ArrowUp,
    ArrowDown,
    Minus,
    Activity,
    Layers,
    Settings2,
    Zap,
    Shield,
    DollarSign,
    ChevronDown,
    ChevronUp,
    Trophy,
    Pause,
    Play,
    Ban,
    Scale
} from 'lucide-react';

// Mock data for strategies performance
const strategiesData = [
    {
        id: 'gamma-magnet',
        name: 'GammaMagnet Convergence',
        type: 'Swing',
        trades: 47,
        winRate: 68.1,
        expectancyR: 1.24,
        profitFactor: 2.15,
        maxDrawdown: 8.2,
        netPnl: 4850,
        confidence: 92,
        action: 'SCALE',
        status: 'LIVE'
    },
    {
        id: 'rate-volatility',
        name: 'Rate-Volatility Alignment',
        type: 'Swing',
        trades: 32,
        winRate: 62.5,
        expectancyR: 0.98,
        profitFactor: 1.82,
        maxDrawdown: 12.4,
        netPnl: 2180,
        confidence: 78,
        action: 'MAINTAIN',
        status: 'LIVE'
    },
    {
        id: 'volguard-mr',
        name: 'VolGuard Mean-Reversion',
        type: 'Intraday',
        trades: 89,
        winRate: 71.9,
        expectancyR: 0.65,
        profitFactor: 2.48,
        maxDrawdown: 5.1,
        netPnl: 3420,
        confidence: 95,
        action: 'SCALE',
        status: 'LIVE'
    },
    {
        id: 'multi-day-rejection',
        name: 'Multi-Day Rejection',
        type: 'Position',
        trades: 18,
        winRate: 55.6,
        expectancyR: 1.85,
        profitFactor: 1.92,
        maxDrawdown: 15.2,
        netPnl: 1980,
        confidence: 65,
        action: 'REDUCE',
        status: 'WATCH'
    }
];

const dataQualityMetrics = {
    completeness: 94,
    validity: 98,
    consistency: 91,
    timeliness: 100
};

const portfolioMetrics = {
    totalTrades: 186,
    overallWinRate: 66.7,
    avgExpectancy: 1.18,
    avgProfitFactor: 2.09,
    portfolioDrawdown: 11.2,
    sharpeRatio: 1.85,
    netPnl: 12430
};

const PerformancePage = () => {
    const [activeTab, setActiveTab] = useState('portfolio');
    const [expandedStrategy, setExpandedStrategy] = useState(null);
    const [timeFilter, setTimeFilter] = useState('30d');

    const getActionColor = (action) => {
        switch (action) {
            case 'SCALE': return 'text-emerald-400 bg-emerald-500/20';
            case 'MAINTAIN': return 'text-blue-400 bg-blue-500/20';
            case 'REDUCE': return 'text-yellow-400 bg-yellow-500/20';
            case 'PAUSE': return 'text-orange-400 bg-orange-500/20';
            case 'BAN': return 'text-red-400 bg-red-500/20';
            default: return 'text-gray-400 bg-gray-500/20';
        }
    };

    const getActionIcon = (action) => {
        switch (action) {
            case 'SCALE': return <ArrowUp className="w-4 h-4" />;
            case 'MAINTAIN': return <Minus className="w-4 h-4" />;
            case 'REDUCE': return <ArrowDown className="w-4 h-4" />;
            case 'PAUSE': return <Pause className="w-4 h-4" />;
            case 'BAN': return <Ban className="w-4 h-4" />;
            default: return <Minus className="w-4 h-4" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'LIVE': return 'text-emerald-400';
            case 'WATCH': return 'text-yellow-400';
            case 'OFF': return 'text-gray-400';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Performance Analytics</h1>
                    <p className="text-muted-foreground text-sm">Master Engine • Quantitative Strategy Analysis</p>
                </div>

                {/* Time Filter */}
                <div className="flex items-center gap-2">
                    {['7d', '30d', '90d', 'YTD', 'All'].map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setTimeFilter(filter)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${timeFilter === filter
                                    ? 'bg-primary text-white'
                                    : 'bg-white/5 text-muted-foreground hover:bg-secondary'
                                }`}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-border pb-2">
                <button
                    onClick={() => setActiveTab('portfolio')}
                    className={`tab-selector ${activeTab === 'portfolio' ? 'tab-selector-active' : ''}`}
                >
                    <Layers className="w-4 h-4 inline mr-2" />
                    Portfolio
                </button>
                {strategiesData.map((strategy) => (
                    <button
                        key={strategy.id}
                        onClick={() => setActiveTab(strategy.id)}
                        className={`tab-selector ${activeTab === strategy.id ? 'tab-selector-active' : ''} flex items-center gap-2`}
                    >
                        <span className={`w-2 h-2 rounded-full ${getStatusColor(strategy.status)}`} />
                        {strategy.name.split(' ')[0]}
                    </button>
                ))}
            </div>

            {activeTab === 'portfolio' ? (
                <>
                    {/* Data Quality Layer */}
                    <div className="glass-enhanced p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="w-5 h-5 text-primary" />
                            <h3 className="font-semibold">Data Quality Layer</h3>
                            <span className="text-xs text-muted-foreground ml-2">Last updated: 2 min ago</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Object.entries(dataQualityMetrics).map(([key, value]) => (
                                <div key={key} className="glass-tab p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-muted-foreground capitalize">{key}</span>
                                        {value >= 90 ? (
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                        ) : value >= 70 ? (
                                            <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-red-400" />
                                        )}
                                    </div>
                                    <div className="stat-number text-foreground">{value}%</div>
                                    <div className="h-1.5 bg-secondary rounded-full mt-2 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${value >= 90 ? 'bg-emerald-500' : value >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                                                }`}
                                            style={{ width: `${value}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Core Portfolio Metrics */}
                    <div className="glass-enhanced p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Activity className="w-5 h-5 text-primary" />
                            <h3 className="font-semibold">Core Metrics</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                            <div className="glass-tab p-4 text-center">
                                <span className="text-sm text-muted-foreground block mb-1">Total Trades</span>
                                <span className="stat-number">{portfolioMetrics.totalTrades}</span>
                            </div>
                            <div className="glass-tab p-4 text-center">
                                <span className="text-sm text-muted-foreground block mb-1">Win Rate</span>
                                <span className="stat-number text-emerald-400">{portfolioMetrics.overallWinRate}%</span>
                            </div>
                            <div className="glass-tab p-4 text-center">
                                <span className="text-sm text-muted-foreground block mb-1">Expectancy (R)</span>
                                <span className="stat-number">{portfolioMetrics.avgExpectancy}</span>
                            </div>
                            <div className="glass-tab p-4 text-center">
                                <span className="text-sm text-muted-foreground block mb-1">Profit Factor</span>
                                <span className="stat-number text-emerald-400">{portfolioMetrics.avgProfitFactor}</span>
                            </div>
                            <div className="glass-tab p-4 text-center">
                                <span className="text-sm text-muted-foreground block mb-1">Max Drawdown</span>
                                <span className="stat-number text-red-400">{portfolioMetrics.portfolioDrawdown}%</span>
                            </div>
                            <div className="glass-tab p-4 text-center">
                                <span className="text-sm text-muted-foreground block mb-1">Sharpe Ratio</span>
                                <span className="stat-number">{portfolioMetrics.sharpeRatio}</span>
                            </div>
                            <div className="glass-tab p-4 text-center">
                                <span className="text-sm text-muted-foreground block mb-1">Net P&L</span>
                                <span className="stat-number text-emerald-400">${portfolioMetrics.netPnl.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Strategy Leaderboard */}
                    <div className="glass-enhanced p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-yellow-400" />
                                <h3 className="font-semibold">Strategy Leaderboard</h3>
                            </div>
                            <span className="text-xs text-muted-foreground">Ranked by Risk-Adjusted Return</span>
                        </div>

                        <div className="space-y-3">
                            {strategiesData.sort((a, b) => b.expectancyR * b.winRate - a.expectancyR * a.winRate).map((strategy, index) => (
                                <div
                                    key={strategy.id}
                                    className="glass-tab p-4 cursor-pointer hover:border-primary/40 transition-all"
                                    onClick={() => setExpandedStrategy(expandedStrategy === strategy.id ? null : strategy.id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                                                #{index + 1}
                                            </span>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium">{strategy.name}</h4>
                                                    <span className={`text-xs ${getStatusColor(strategy.status)}`}>● {strategy.status}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{strategy.type} • {strategy.trades} trades</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            <div className="text-right hidden md:block">
                                                <span className="text-sm text-muted-foreground">Win Rate</span>
                                                <p className="font-semibold text-emerald-400">{strategy.winRate}%</p>
                                            </div>
                                            <div className="text-right hidden md:block">
                                                <span className="text-sm text-muted-foreground">Exp. (R)</span>
                                                <p className="font-semibold">{strategy.expectancyR}</p>
                                            </div>
                                            <div className="text-right hidden lg:block">
                                                <span className="text-sm text-muted-foreground">P.Factor</span>
                                                <p className="font-semibold">{strategy.profitFactor}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm text-muted-foreground">Net P&L</span>
                                                <p className={`font-semibold ${strategy.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    ${strategy.netPnl.toLocaleString()}
                                                </p>
                                            </div>

                                            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${getActionColor(strategy.action)}`}>
                                                {getActionIcon(strategy.action)}
                                                <span className="font-medium text-sm">{strategy.action}</span>
                                            </div>

                                            {expandedStrategy === strategy.id ? (
                                                <ChevronUp className="w-5 h-5 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {expandedStrategy === strategy.id && (
                                        <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="p-3 bg-white/5 rounded-lg">
                                                <span className="text-xs text-muted-foreground block">Confidence</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold">{strategy.confidence}%</span>
                                                    <div className="flex-1 h-1.5 bg-secondary rounded-full">
                                                        <div
                                                            className="h-full bg-primary rounded-full"
                                                            style={{ width: `${strategy.confidence}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-white/5 rounded-lg">
                                                <span className="text-xs text-muted-foreground block">Max Drawdown</span>
                                                <span className="font-semibold text-red-400">{strategy.maxDrawdown}%</span>
                                            </div>
                                            <div className="p-3 bg-white/5 rounded-lg">
                                                <span className="text-xs text-muted-foreground block">Sample Size</span>
                                                <span className="font-semibold">{strategy.trades} trades</span>
                                            </div>
                                            <div className="p-3 bg-white/5 rounded-lg">
                                                <span className="text-xs text-muted-foreground block">Next Move</span>
                                                <span className="font-semibold text-primary">Review edge optimization</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Optimization Moves */}
                    <div className="glass-enhanced p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Zap className="w-5 h-5 text-yellow-400" />
                            <h3 className="font-semibold">Optimization Moves</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="glass-tab p-4 border-l-4 border-emerald-500">
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                    Edge Optimization
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                    Consider scaling GammaMagnet position size by 15% during high volatility regimes.
                                </p>
                            </div>
                            <div className="glass-tab p-4 border-l-4 border-yellow-500">
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-yellow-400" />
                                    Risk Optimization
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                    Reduce Multi-Day Rejection exposure until drawdown recovers to &lt;10%.
                                </p>
                            </div>
                            <div className="glass-tab p-4 border-l-4 border-blue-500">
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-blue-400" />
                                    Cost Optimization
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                    Switch Rate-Volatility entries to limit orders to reduce slippage by ~$8/trade.
                                </p>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                /* Individual Strategy Tab */
                <StrategyDetailTab
                    strategy={strategiesData.find(s => s.id === activeTab)}
                />
            )}
        </div>
    );
};

// Individual Strategy Detail Component
const StrategyDetailTab = ({ strategy }) => {
    const [segmentMode, setSegmentMode] = useState('guided');

    if (!strategy) return null;

    const segmentationFilters = [
        { label: 'Setup Quality', values: ['A+', 'A', 'B', 'C'], active: 'A+' },
        { label: 'Session', values: ['London', 'New York', 'Asia', 'Overlap'], active: 'New York' },
        { label: 'Planned vs Unplanned', values: ['Planned', 'Unplanned'], active: 'Planned' },
        { label: 'Market Regime', values: ['Trending', 'Ranging', 'Volatile'], active: 'Trending' },
        { label: 'Direction', values: ['Long', 'Short'], active: 'Long' },
    ];

    return (
        <div className="space-y-6">
            {/* Strategy DNA */}
            <div className="glass-enhanced p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">Strategy DNA</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${strategy.status === 'LIVE' ? 'text-emerald-400' :
                                strategy.status === 'WATCH' ? 'text-yellow-400' : 'text-gray-400'
                            }`}>
                            ● {strategy.status}
                        </span>
                        <span className="text-sm text-muted-foreground">| {strategy.trades} trades | Confidence: {strategy.confidence}%</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="glass-tab p-4 text-center">
                        <span className="text-sm text-muted-foreground block mb-1">Win Rate</span>
                        <span className="stat-number text-emerald-400">{strategy.winRate}%</span>
                    </div>
                    <div className="glass-tab p-4 text-center">
                        <span className="text-sm text-muted-foreground block mb-1">Expectancy (R)</span>
                        <span className="stat-number">{strategy.expectancyR}</span>
                    </div>
                    <div className="glass-tab p-4 text-center">
                        <span className="text-sm text-muted-foreground block mb-1">Profit Factor</span>
                        <span className="stat-number">{strategy.profitFactor}</span>
                    </div>
                    <div className="glass-tab p-4 text-center">
                        <span className="text-sm text-muted-foreground block mb-1">Max Drawdown</span>
                        <span className="stat-number text-red-400">{strategy.maxDrawdown}%</span>
                    </div>
                    <div className="glass-tab p-4 text-center">
                        <span className="text-sm text-muted-foreground block mb-1">Net P&L</span>
                        <span className="stat-number text-emerald-400">${strategy.netPnl.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Segmentation Mode Toggle */}
            <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Segmentation:</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setSegmentMode('guided')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${segmentMode === 'guided'
                                ? 'bg-primary text-white'
                                : 'bg-white/5 text-muted-foreground hover:bg-secondary'
                            }`}
                    >
                        Guided Mode
                    </button>
                    <button
                        onClick={() => setSegmentMode('discovery')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${segmentMode === 'discovery'
                                ? 'bg-primary text-white'
                                : 'bg-white/5 text-muted-foreground hover:bg-secondary'
                            }`}
                    >
                        Discovery Mode
                    </button>
                </div>
            </div>

            {/* Segmentation Filters */}
            {segmentMode === 'guided' && (
                <div className="glass-enhanced p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-primary" />
                        Guided Segmentation
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {segmentationFilters.map((filter) => (
                            <div key={filter.label} className="glass-tab p-4">
                                <span className="text-sm text-muted-foreground block mb-2">{filter.label}</span>
                                <div className="flex flex-wrap gap-1">
                                    {filter.values.map((value) => (
                                        <button
                                            key={value}
                                            className={`px-2 py-1 rounded text-xs font-medium transition-all ${filter.active === value
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white/5 text-muted-foreground hover:bg-secondary'
                                                }`}
                                        >
                                            {value}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Next 3 Moves */}
            <div className="glass-enhanced p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <h3 className="font-semibold">Next 3 Priority Moves</h3>
                </div>

                <div className="space-y-3">
                    <div className="glass-tab p-4 border-l-4 border-emerald-500 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">1</span>
                            <div>
                                <p className="font-medium">Increase position size on A+ setups</p>
                                <p className="text-sm text-muted-foreground">+23% win rate on A+ vs overall</p>
                            </div>
                        </div>
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">HIGH IMPACT</span>
                    </div>

                    <div className="glass-tab p-4 border-l-4 border-yellow-500 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 font-bold">2</span>
                            <div>
                                <p className="font-medium">Avoid Asia session entries</p>
                                <p className="text-sm text-muted-foreground">-15% win rate during Asia</p>
                            </div>
                        </div>
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">MEDIUM IMPACT</span>
                    </div>

                    <div className="glass-tab p-4 border-l-4 border-blue-500 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">3</span>
                            <div>
                                <p className="font-medium">Review short entries in trending regime</p>
                                <p className="text-sm text-muted-foreground">Counter-trend shorts underperforming</p>
                            </div>
                        </div>
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">REVIEW</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PerformancePage;
