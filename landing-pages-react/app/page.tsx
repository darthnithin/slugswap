'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, Zap, Palette } from 'lucide-react';
import Link from 'next/link';

const pages = [
  {
    id: 'hero-bold',
    title: 'Hero Bold',
    description: 'Brutalist editorial design with BOLD typography, high contrast black/yellow/blue/red. Impact font, thick borders, absolute chaos controlled. LOUD and confident.',
    tags: ['Brutalist', 'Editorial', 'Bold'],
    gradient: 'from-yellow-400 via-blue-500 to-red-500',
    textColor: 'text-yellow-400',
    icon: <Zap className="w-6 h-6" />
  },
  {
    id: 'maximalist',
    title: 'Maximalist Chaos',
    description: 'OVERWHELMING visual richness. Layered elements, clashing colors, geometric shapes floating everywhere. Early web meets modern design on steroids. Organized chaos.',
    tags: ['Maximalist', 'Chaotic', 'Layered'],
    gradient: 'from-orange-500 via-pink-500 to-purple-500',
    textColor: 'text-orange-400',
    icon: <Sparkles className="w-6 h-6" />
  },
  {
    id: 'collision',
    title: 'Collision Grid',
    description: 'Radical asymmetry with diagonal 60/40 split. Overlapping content zones, shattered grid, elements breaking boundaries. Burn orange vs electric teal. Archivo Black + Work Sans. AGGRESSIVE and BOLD.',
    tags: ['Asymmetric', 'Diagonal', 'Collision'],
    gradient: 'from-orange-500 via-teal-400 to-blue-900',
    textColor: 'text-orange-500',
    icon: <Zap className="w-6 h-6" />
  }
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [90, 0, 90],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 blur-3xl"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 px-6 md:px-12 py-20">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-20"
          >
            <Badge className="mb-8 bg-white/10 backdrop-blur-md border border-white/20 text-white px-6 py-3 text-sm font-bold">
              <Sparkles className="w-4 h-4 mr-2 inline" />
              SLUGSWAP LANDING PAGES v2.0
            </Badge>
            <h1 className="text-6xl md:text-8xl font-black mb-6 text-white">
              BREATHTAKING<br />Designs
            </h1>
            <p className="text-2xl text-gray-300 max-w-3xl mx-auto mb-8">
              3 unique, UNFORGETTABLE React landing pages that make people say "WOW"
            </p>
            <p className="text-lg text-gray-400">
              Each with BOLD aesthetic direction. Zero AI slop. Maximum creativity.
            </p>
          </motion.div>

          {/* Page Grid */}
          <div className="grid md:grid-cols-2 gap-8 mb-20">
            {pages.map((page, i) => (
              <motion.div
                key={page.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <Link href={`/${page.id}`}>
                  <Card className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/30 p-8 h-full transition-all hover:scale-105 hover:bg-white/10 cursor-pointer group">
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`h-2 w-20 bg-gradient-to-r ${page.gradient} rounded-full group-hover:w-32 transition-all`} />
                      <div className={`${page.textColor}`}>
                        {page.icon}
                      </div>
                    </div>

                    <h3 className={`text-4xl font-black mb-4 ${page.textColor}`}>
                      {page.title}
                    </h3>

                    <p className="text-gray-300 mb-6 leading-relaxed text-lg">
                      {page.description}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-6">
                      {page.tags.map((tag) => (
                        <Badge key={tag} className="bg-white/10 text-white border-0 text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center text-white font-semibold group-hover:translate-x-2 transition-transform">
                      View Design <ArrowRight className="ml-2 w-4 h-4" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Info Section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="grid md:grid-cols-2 gap-8 mb-20"
          >
            <Card className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md border border-white/20 p-8">
              <div className="text-5xl mb-6">💡</div>
              <h3 className="text-2xl font-black mb-4 text-white">
                About This Collection
              </h3>
              <p className="text-gray-300 mb-4 leading-relaxed">
                All pages use the same copy from <code className="bg-white/10 px-2 py-1 rounded text-purple-300">landing-page-copy.md</code> but with COMPLETELY different visual treatments.
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">
                No generic gradients. No typical layouts. Each design is BOLD, distinctive, and unforgettable.
              </p>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-md border border-purple-500/30 p-8">
              <div className="text-5xl mb-6">⚡</div>
              <h3 className="text-2xl font-black mb-4 text-white">
                Tech Stack
              </h3>
              <div className="space-y-2 text-gray-300">
                <p>✓ Next.js 15 + React 19</p>
                <p>✓ TypeScript</p>
                <p>✓ Tailwind CSS</p>
                <p>✓ shadcn/ui Components</p>
                <p>✓ Framer Motion Animations</p>
                <p>✓ Production-Ready Code</p>
              </div>
            </Card>
          </motion.div>

          {/* Design Philosophy */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center"
          >
            <h2 className="text-4xl font-black text-white mb-6">Design Philosophy</h2>
            <p className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed mb-8">
              Each design commits FULLY to a bold aesthetic direction. No timid choices. No generic patterns.
              These pages are UNFORGETTABLE because they dare to be different.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-4 py-2">
                Bold Typography
              </Badge>
              <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-4 py-2">
                Unexpected Layouts
              </Badge>
              <Badge className="bg-pink-500/20 text-pink-300 border border-pink-500/30 px-4 py-2">
                Visual Impact
              </Badge>
              <Badge className="bg-green-500/20 text-green-300 border border-green-500/30 px-4 py-2">
                Distinctive Aesthetics
              </Badge>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
