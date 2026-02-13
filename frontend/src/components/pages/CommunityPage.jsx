import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  Users, Heart, MessageCircle, Share2, Plus, Image as ImageIcon, TrendingUp,
  Hash, Bell, Crown, Trophy, Flame, Star, Send, MoreHorizontal, Check,
  AtSign, Smile, PaperclipIcon, Circle, Mic
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Fake online users for demo
const onlineUsers = [
  { id: 1, name: 'TradingPro', avatar: 'T', status: 'online', streak: 15 },
  { id: 2, name: 'CryptoKing', avatar: 'C', status: 'online', streak: 8 },
  { id: 3, name: 'SwingMaster', avatar: 'S', status: 'idle', streak: 22 },
  { id: 4, name: 'DayTraderX', avatar: 'D', status: 'online', streak: 5 },
  { id: 5, name: 'GoldBull', avatar: 'G', status: 'dnd', streak: 31 },
];

// Discord-style channels
const channels = [
  { id: 'general', name: 'generale', icon: Hash, unread: 3 },
  { id: 'winners', name: 'winners-only', icon: Trophy, unread: 0, special: true },
  { id: 'strategies', name: 'strategie', icon: TrendingUp, unread: 1 },
  { id: 'announcements', name: 'annunci', icon: Bell, unread: 0 },
];

// Sample trending topics
const trendingTopics = [
  { tag: '#NFP', count: 234 },
  { tag: '#BTCATH', count: 189 },
  { tag: '#GoldBreakout', count: 156 },
];

// Stories (IG style)
const stories = [
  { id: 1, user: 'KarionTeam', avatar: '🐂', isOfficial: true, seen: false },
  { id: 2, user: '+$2.4K', avatar: 'M', color: 'from-emerald-500 to-cyan-500', seen: false },
  { id: 3, user: '+$890', avatar: 'A', color: 'from-purple-500 to-pink-500', seen: true },
  { id: 4, user: '+$3.1K', avatar: 'J', color: 'from-orange-500 to-red-500', seen: false },
  { id: 5, user: '+$560', avatar: 'L', color: 'from-blue-500 to-indigo-500', seen: true },
];

// User Status Indicator
const StatusIndicator = ({ status }) => {
  const colors = {
    online: 'bg-emerald-500',
    idle: 'bg-yellow-500',
    dnd: 'bg-red-500',
    offline: 'bg-gray-500'
  };

  return (
    <span className={cn(
      "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
      colors[status] || colors.offline
    )} />
  );
};

// Story Circle Component
const StoryCircle = ({ story, onClick }) => (
  <button
    onClick={() => onClick(story)}
    className="flex flex-col items-center gap-1 min-w-[72px]"
  >
    <div className={cn(
      "w-16 h-16 rounded-full p-0.5",
      story.seen
        ? "bg-gray-500"
        : story.isOfficial
          ? "bg-gradient-to-tr from-primary via-yellow-500 to-primary animate-pulse"
          : `bg-gradient-to-tr ${story.color || 'from-primary to-emerald-500'}`
    )}>
      <div className="w-full h-full rounded-full bg-background flex items-center justify-center text-xl">
        {story.avatar}
      </div>
    </div>
    <span className={cn(
      "text-xs truncate max-w-[72px]",
      story.isOfficial ? "text-primary font-medium" : "text-muted-foreground"
    )}>
      {story.user}
    </span>
  </button>
);

// Channel Item
const ChannelItem = ({ channel, active, onClick }) => (
  <button
    onClick={() => onClick(channel.id)}
    className={cn(
      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
      active
        ? "bg-primary/20 text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      channel.special && "text-yellow-400"
    )}
  >
    <channel.icon className="w-4 h-4" />
    <span className="flex-1 text-left">{channel.name}</span>
    {channel.unread > 0 && (
      <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
        {channel.unread}
      </span>
    )}
  </button>
);

export default function CommunityPage() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeChannel, setActiveChannel] = useState('general');
  const [chatMessage, setChatMessage] = useState('');
  const [formData, setFormData] = useState({
    image_url: '',
    caption: '',
    profit: 0
  });

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const res = await axios.get(`${API}/community/posts`);
      setPosts(res.data);
    } catch (error) {
      // Demo posts
      setPosts([
        {
          id: 1,
          user_name: 'TradingPro',
          caption: '🔥 BTC long dal supporto weekly, +2.4R! La pazienza paga sempre.',
          profit: 2400,
          likes: 45,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          comments: [{ text: 'Grande!' }]
        },
        {
          id: 2,
          user_name: 'CryptoKing',
          caption: 'Short su GOLD dopo il rejection dalla zona premium. S1 strategy perfetta ✅',
          profit: 890,
          likes: 32,
          created_at: new Date(Date.now() - 7200000).toISOString(),
          comments: []
        }
      ]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/community/posts`, formData);
      toast.success('Post pubblicato!');
      fetchPosts();
      setShowForm(false);
      setFormData({ image_url: '', caption: '', profit: 0 });
    } catch (error) {
      toast.error('Errore nella pubblicazione');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (postId) => {
    try {
      await axios.post(`${API}/community/posts/${postId}/like`);
      fetchPosts();
    } catch (error) {
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, likes: (p.likes || 0) + 1 } : p
      ));
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}g`;
  };

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    toast.success('Messaggio inviato!');
    setChatMessage('');
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* Left Sidebar - Discord Style */}
      <div className="hidden lg:flex flex-col w-60 bg-white/5 rounded-2xl p-4 space-y-6">
        {/* Server Name */}
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold">K</span>
          </div>
          <div>
            <h3 className="font-bold">Karion Club</h3>
            <p className="text-xs text-muted-foreground">1,234 members</p>
          </div>
        </div>

        {/* Channels */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Canali</p>
          {channels.map(channel => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              active={activeChannel === channel.id}
              onClick={setActiveChannel}
            />
          ))}
        </div>

        {/* Trending */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase font-medium">Trending</p>
          {trendingTopics.map((topic, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-primary">{topic.tag}</span>
              <span className="text-xs text-muted-foreground">{topic.count}</span>
            </div>
          ))}
        </div>

        {/* Online Users */}
        <div className="flex-1 overflow-hidden">
          <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Online — {onlineUsers.filter(u => u.status === 'online').length}</p>
          <div className="space-y-1">
            {onlineUsers.map(user => (
              <div key={user.id} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-secondary cursor-pointer">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                    {user.avatar}
                  </div>
                  <StatusIndicator status={user.status} />
                </div>
                <span className="text-sm truncate flex-1">{user.name}</span>
                {user.streak > 10 && (
                  <div className="flex items-center gap-0.5 text-orange-400">
                    <Flame className="w-3 h-3" />
                    <span className="text-xs">{user.streak}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Community
            </h1>
            <p className="text-sm text-muted-foreground">Discord + Instagram style</p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl"
            data-testid="new-post-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            Condividi Win
          </Button>
        </motion.div>

        {/* Stories Row (IG Style) */}
        <div className="bg-white/5 rounded-2xl p-4">
          <ScrollArea orientation="horizontal" className="w-full">
            <div className="flex gap-4">
              {/* Add Story */}
              <button className="flex flex-col items-center gap-1 min-w-[72px]">
                <div className="w-16 h-16 rounded-full bg-secondary border-2 border-dashed border-primary/50 flex items-center justify-center">
                  <Plus className="w-6 h-6 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground">La tua</span>
              </button>

              {stories.map(story => (
                <StoryCircle
                  key={story.id}
                  story={story}
                  onClick={() => toast.info('Story in arrivo!')}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* New Post Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="bg-card/80 border-primary/30" data-testid="post-form">
                <CardContent className="p-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Textarea
                          value={formData.caption}
                          onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                          placeholder="Racconta il tuo trade vincente... 🎯"
                          className="bg-white/5 min-h-[100px]"
                          data-testid="caption-textarea"
                        />
                        <div className="flex items-center gap-2">
                          <button type="button" className="p-2 rounded-lg hover:bg-secondary">
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                          </button>
                          <button type="button" className="p-2 rounded-lg hover:bg-secondary">
                            <Smile className="w-5 h-5 text-muted-foreground" />
                          </button>
                          <div className="flex-1" />
                          <Input
                            type="number"
                            value={formData.profit}
                            onChange={(e) => setFormData({ ...formData, profit: parseFloat(e.target.value) })}
                            className="w-32 bg-white/5"
                            placeholder="Profit $"
                            data-testid="profit-input"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                        Annulla
                      </Button>
                      <Button type="submit" disabled={loading} className="rounded-xl" data-testid="submit-post-btn">
                        {loading ? 'Pubblicando...' : 'Pubblica 🚀'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feed */}
        <ScrollArea className="flex-1">
          <div className="space-y-4 pr-4">
            {posts.length === 0 ? (
              <Card className="bg-card/80 border-border/50">
                <CardContent className="py-12 text-center">
                  <Trophy className="w-12 h-12 mx-auto mb-4 text-yellow-400 opacity-50" />
                  <p className="text-muted-foreground">Nessun post ancora</p>
                  <p className="text-sm text-muted-foreground">Sii il primo a condividere un win!</p>
                </CardContent>
              </Card>
            ) : (
              posts.map((post, i) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="bg-card/80 border-border/50 hover:border-primary/30 transition-colors" data-testid={`post-${post.id}`}>
                    <CardContent className="p-4">
                      {/* Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/50 to-emerald-500/50 flex items-center justify-center text-white font-bold">
                          {post.user_name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{post.user_name}</p>
                            {post.profit > 1000 && <Crown className="w-4 h-4 text-yellow-400" />}
                          </div>
                          <p className="text-xs text-muted-foreground">{formatTimeAgo(post.created_at)}</p>
                        </div>
                        {post.profit > 0 && (
                          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-bold">
                            +${post.profit.toLocaleString()}
                          </span>
                        )}
                        <button className="p-1 hover:bg-secondary rounded-lg">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>

                      {/* Content */}
                      <p className="text-sm mb-4 whitespace-pre-wrap">{post.caption}</p>

                      {/* Actions */}
                      <div className="flex items-center gap-6 pt-3 border-t border-border">
                        <button
                          onClick={() => handleLike(post.id)}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-red-400 transition-colors group"
                          data-testid={`like-${post.id}`}
                        >
                          <Heart className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          <span>{post.likes}</span>
                        </button>
                        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                          <MessageCircle className="w-5 h-5" />
                          <span>{post.comments?.length || 0}</span>
                        </button>
                        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors ml-auto">
                          <Share2 className="w-5 h-5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Chat Input (Discord style) */}
        <div className="bg-white/5 rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-secondary">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </button>
            <Input
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder={`Messaggio in #${activeChannel}...`}
              className="flex-1 bg-transparent border-none focus-visible:ring-0"
            />
            <button className="p-2 rounded-lg hover:bg-secondary">
              <Smile className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleSendChat}
              className="p-2 rounded-lg bg-primary hover:bg-primary/80"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
