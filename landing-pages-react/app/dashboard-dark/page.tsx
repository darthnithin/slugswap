'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Terminal, Activity, Zap, Shield, Users, TrendingUp } from 'lucide-react';

export default function DashboardDark() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#00ff41] font-mono relative overflow-hidden">
      {/* Terminal Grid Background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(#00ff41 1px, transparent 1px), linear-gradient(90deg, #00ff41 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />
      </div>

      {/* Scanline Effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-50"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 65, 0.03) 2px, rgba(0, 255, 65, 0.03) 4px)'
        }}
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <div className="relative z-10 px-6 md:px-12 py-8">
        {/* Terminal Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 border-2 border-[#00ff41] bg-[#0a0a0f]/90 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between p-4 border-b-2 border-[#00ff41]/30">
            <div className="flex items-center gap-4">
              <Terminal className="w-6 h-6" />
              <span className="text-sm">root@slugswap:~$</span>
            </div>
            <div className="flex gap-2">
              {['[_]', '[□]', '[X]'].map((btn, i) => (
                <div key={i} className="w-8 h-6 border border-[#00ff41]/50 flex items-center justify-center text-xs">
                  {btn}
                </div>
              ))}
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start gap-2 mb-2">
              <span>{'>'}</span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                ./slugswap --init
              </motion.span>
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="pl-4 text-[#00ff41]/70"
            >
              [OK] System initialized | v2.0.0-beta
            </motion.div>
          </div>
        </motion.div>

        <div className="max-w-7xl mx-auto">
          {/* ASCII Art Hero */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mb-16 border-2 border-[#00ff41]/30 p-8 bg-[#0a0a0f]/50 backdrop-blur-sm"
          >
            <pre className="text-xs md:text-sm leading-tight mb-6 overflow-x-auto">
{`
 ███████╗██╗     ██╗   ██╗ ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗
 ██╔════╝██║     ██║   ██║██╔════╝ ██╔════╝██║    ██║██╔══██╗██╔══██╗
 ███████╗██║     ██║   ██║██║  ███╗███████╗██║ █╗ ██║███████║██████╔╝
 ╚════██║██║     ██║   ██║██║   ██║╚════██║██║███╗██║██╔══██║██╔═══╝
 ███████║███████╗╚██████╔╝╚██████╔╝███████║╚███╔███╔╝██║  ██║██║
 ╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝
`}
            </pre>
            <div className="border-t-2 border-[#00ff41]/30 pt-6">
              <p className="text-lg mb-4">
                {'>'} <span className="text-white">SHARE DINING POINTS.</span> FAST. FAIR. SIMPLE.
              </p>
              <p className="text-[#00ff41]/70 text-sm">
                // Pooled community support system. Real-time allocation. Zero overhead.
              </p>
            </div>
          </motion.div>

          {/* Live Stats Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              { icon: <Activity className="w-6 h-6" />, label: 'MEALS_SHARED', value: '2847', status: 'ACTIVE', color: '#00ff41' },
              { icon: <Users className="w-6 h-6" />, label: 'DONOR_NODES', value: '412', status: 'ONLINE', color: '#00ff41' },
              { icon: <TrendingUp className="w-6 h-6" />, label: 'EFFICIENCY', value: '73%', status: 'OPTIMAL', color: '#ff6b6b' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.1 }}
              >
                <Card className="bg-[#0f0f14] border-2 border-[#00ff41]/30 p-6 hover:border-[#00ff41] transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div style={{ color: stat.color }}>
                      {stat.icon}
                    </div>
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: stat.color }}
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-xs text-[#00ff41]/70">{stat.status}</span>
                    </div>
                  </div>
                  <div className="text-xs text-[#00ff41]/50 mb-2 font-mono">[{stat.label}]</div>
                  <div className="text-5xl font-bold mb-2" style={{ color: stat.color }}>
                    {stat.value}
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 bg-[#1a1a1f] border border-[#00ff41]/20 mt-4">
                    <motion.div
                      className="h-full"
                      style={{ backgroundColor: stat.color }}
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 1.5, delay: 1.2 + i * 0.1 }}
                    />
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* System Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="mb-16"
          >
            <div className="border-2 border-[#00ff41]/30 bg-[#0a0a0f]/50 backdrop-blur-sm">
              <div className="p-4 border-b-2 border-[#00ff41]/30 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                <span className="font-bold">SYSTEM.FEATURES</span>
              </div>
              <div className="p-8 grid md:grid-cols-2 gap-8">
                {[
                  {
                    cmd: 'pool.init()',
                    title: 'POOLED_WEEKLY_SUPPORT',
                    desc: 'Monthly donations split into weekly pools. Community fund access protocol. Zero individual transaction overhead.',
                  },
                  {
                    cmd: 'allowance.fair()',
                    title: 'FAIR_ALLOWANCES',
                    desc: 'Equal weekly access rights. Automatic Monday reset. First-come distribution algorithm. No judgment protocol.',
                  },
                  {
                    cmd: 'code.instant()',
                    title: 'INSTANT_CLAIM_CODES',
                    desc: 'GET Tools API integration. Sub-second generation. Campus-wide redemption. Time-locked security layer.',
                  },
                  {
                    cmd: 'privacy.shield()',
                    title: 'PRIVACY_PROTECTED',
                    desc: 'Anonymous donor protocol. Encrypted receiver data. Dignity preservation system. Zero tracking.',
                  },
                ].map((feature, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="group"
                  >
                    <div className="mb-4">
                      <span className="text-[#ff6b6b]">{'>'}</span>{' '}
                      <code className="text-[#00ff41]">{feature.cmd}</code>
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-white group-hover:text-[#00ff41] transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-[#00ff41]/70 leading-relaxed">
                      // {feature.desc}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Terminal Output - Testimonials */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
            className="mb-16 border-2 border-[#00ff41]/30 bg-[#0a0a0f]/50 backdrop-blur-sm"
          >
            <div className="p-4 border-b-2 border-[#00ff41]/30">
              <span className="font-bold">USER.LOGS</span>
            </div>
            <div className="p-6 space-y-6">
              {[
                { user: 'maya_t', msg: 'I had 500 points expiring. Now they\'re feeding people instead of disappearing.', status: 'DONOR' },
                { user: 'jordan_l', msg: 'No more choosing between textbooks and food. This changed everything.', status: 'REQUESTER' },
                { user: 'alex_r', msg: 'Weekly reset is genius. Everyone gets fair access. Most equitable system on campus.', status: 'BOTH' },
              ].map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="border-l-2 border-[#00ff41]/50 pl-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm">
                      <span className="text-[#ff6b6b]">[{log.status}]</span>{' '}
                      <span className="text-white">{log.user}</span>
                    </span>
                  </div>
                  <p className="text-[#00ff41]/80 text-sm">
                    "{log.msg}"
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA Terminal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="border-2 border-[#ff6b6b] bg-[#0a0a0f]/90 backdrop-blur-sm mb-16"
          >
            <div className="p-4 border-b-2 border-[#ff6b6b]/30 bg-[#ff6b6b]/10">
              <span className="font-bold text-[#ff6b6b]">SYSTEM.ALERT</span>
            </div>
            <div className="p-12 text-center">
              <h2 className="text-4xl md:text-6xl font-bold mb-6 text-white">
                {'>'} YOUR CAMPUS NEEDS YOU
              </h2>
              <p className="text-xl text-[#00ff41]/80 mb-8 max-w-3xl mx-auto">
                // Initialize contribution protocol. Join distributed support network.
              </p>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  size="lg"
                  className="bg-[#00ff41] hover:bg-[#00ff41]/90 text-[#0a0a0f] font-bold text-xl px-12 py-6 h-auto border-2 border-[#00ff41] shadow-[0_0_20px_rgba(0,255,65,0.3)]"
                >
                  $ ./download-slugswap.sh
                </Button>
              </motion.div>
              <p className="mt-6 text-sm text-[#00ff41]/50">
                // iOS | Free | GET Tools Integration
              </p>
            </div>
          </motion.div>

          {/* System Info Footer */}
          <div className="border-t-2 border-[#00ff41]/30 pt-6 pb-12 flex justify-between items-center text-xs text-[#00ff41]/50">
            <div>SLUGSWAP v2.0.0-beta | Build 20260210</div>
            <div>Uptime: ∞ | Status: OPERATIONAL</div>
          </div>
        </div>
      </div>
    </div>
  );
}
