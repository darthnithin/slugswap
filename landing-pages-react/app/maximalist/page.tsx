'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Maximalist() {
  return (
    <div className="min-h-screen bg-[#ff6b35] relative overflow-hidden">
      {/* CHAOTIC BACKGROUND LAYERS */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 200 + 50,
              height: Math.random() * 200 + 50,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: ['#4ecdc4', '#f7dc6f', '#e74c3c', '#9b59b6', '#2ecc71'][Math.floor(Math.random() * 5)],
            }}
            animate={{
              x: [0, Math.random() * 100 - 50],
              y: [0, Math.random() * 100 - 50],
              rotate: [0, Math.random() * 360],
              scale: [1, Math.random() * 0.5 + 0.75, 1],
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        ))}
      </div>

      {/* DIAGONAL STRIPES OVERLAY */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(0,0,0,0.5) 35px, rgba(0,0,0,0.5) 70px)'
      }} />

      {/* MAIN CONTENT */}
      <div className="relative z-10 px-6 md:px-12 py-12">
        {/* CHAOTIC HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between mb-12 flex-wrap gap-4"
        >
          <div className="flex items-center gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 bg-[#4ecdc4] border-8 border-black transform rotate-12"
            />
            <h1 className="text-5xl font-black tracking-tighter" style={{ fontFamily: 'Impact, sans-serif' }}>
              SLUGSWAP
            </h1>
          </div>
          <div className="flex gap-2">
            {['DONATE', 'REQUEST', 'STATS'].map((text, i) => (
              <motion.div
                key={text}
                whileHover={{ scale: 1.1, rotate: -5 }}
                className="px-4 py-2 bg-black text-[#f7dc6f] font-black text-sm border-4 border-[#4ecdc4] transform -rotate-2"
                style={{ fontFamily: 'Arial Black, sans-serif' }}
              >
                {text}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* HERO SECTION - ABSOLUTE CHAOS */}
        <div className="max-w-7xl mx-auto mb-20">
          {/* GIANT STACKED TEXT */}
          <div className="relative mb-12">
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <h2
                className="text-[12rem] md:text-[20rem] font-black leading-none tracking-tighter text-black transform -rotate-3 relative z-10"
                style={{
                  fontFamily: 'Impact, sans-serif',
                  WebkitTextStroke: '4px #fff',
                  paintOrder: 'stroke fill'
                }}
              >
                SHARE
              </h2>
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -top-10 -right-10 w-40 h-40 bg-[#f7dc6f] border-8 border-black transform rotate-45 z-0"
              />
            </motion.div>

            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="relative -mt-20 ml-20"
            >
              <h2
                className="text-[12rem] md:text-[20rem] font-black leading-none tracking-tighter text-[#4ecdc4] transform rotate-2"
                style={{
                  fontFamily: 'Impact, sans-serif',
                  WebkitTextStroke: '4px #000',
                  paintOrder: 'stroke fill'
                }}
              >
                DINING
              </h2>
            </motion.div>

            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative -mt-20"
            >
              <h2
                className="text-[12rem] md:text-[20rem] font-black leading-none tracking-tighter text-[#e74c3c] transform -rotate-1"
                style={{
                  fontFamily: 'Impact, sans-serif',
                  WebkitTextStroke: '4px #fff',
                  paintOrder: 'stroke fill'
                }}
              >
                POINTS
              </h2>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute top-1/2 right-20 w-32 h-32 bg-[#9b59b6] rounded-full border-8 border-black"
              />
            </motion.div>
          </div>

          {/* CHAOTIC INFO BOXES */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <motion.div
              whileHover={{ rotate: -2, scale: 1.05 }}
              className="bg-[#f7dc6f] border-8 border-black p-8 transform rotate-1 relative overflow-hidden"
            >
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-[#e74c3c] rounded-full border-4 border-black" />
              <h3 className="text-6xl font-black mb-4" style={{ fontFamily: 'Impact, sans-serif' }}>2,847</h3>
              <p className="font-black text-xl" style={{ fontFamily: 'Arial Black, sans-serif' }}>MEALS SHARED</p>
              <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-black transform rotate-45" />
            </motion.div>

            <motion.div
              whileHover={{ rotate: 2, scale: 1.05 }}
              className="bg-[#4ecdc4] border-8 border-black p-8 transform -rotate-2 relative"
            >
              <div className="absolute top-0 right-0 w-0 h-0 border-l-[100px] border-l-transparent border-t-[100px] border-t-[#9b59b6]" />
              <h3 className="text-6xl font-black mb-4 relative z-10" style={{ fontFamily: 'Impact, sans-serif' }}>412</h3>
              <p className="font-black text-xl relative z-10" style={{ fontFamily: 'Arial Black, sans-serif' }}>ACTIVE DONORS</p>
            </motion.div>

            <motion.div
              whileHover={{ rotate: -3, scale: 1.05 }}
              className="bg-[#2ecc71] border-8 border-black p-8 transform rotate-3 relative"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute -top-8 -left-8 w-24 h-24 bg-[#f7dc6f] border-4 border-black"
              />
              <h3 className="text-6xl font-black mb-4" style={{ fontFamily: 'Impact, sans-serif' }}>73%</h3>
              <p className="font-black text-xl" style={{ fontFamily: 'Arial Black, sans-serif' }}>IMPACT SCORE</p>
            </motion.div>
          </div>

          {/* TAGLINE - OVERLAPPING CHAOS */}
          <div className="relative mb-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-black text-white p-8 border-8 border-[#f7dc6f] transform -rotate-1 relative z-20"
            >
              <p className="text-3xl md:text-5xl font-black leading-tight" style={{ fontFamily: 'Impact, sans-serif' }}>
                FAST. FAIR. SIMPLE.
              </p>
            </motion.div>
            <div className="absolute top-4 left-4 w-full h-full bg-[#e74c3c] border-8 border-black transform rotate-2 z-10" />
            <div className="absolute top-8 left-8 w-full h-full bg-[#4ecdc4] border-8 border-black transform -rotate-3 z-0" />
          </div>

          {/* CTA BUTTONS - MAXIMUM CHAOS */}
          <div className="flex flex-wrap gap-6">
            <motion.div whileHover={{ scale: 1.1, rotate: -5 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                className="bg-[#e74c3c] hover:bg-[#c0392b] text-white border-8 border-black font-black text-2xl px-12 py-8 h-auto transform rotate-2 shadow-[8px_8px_0_#000]"
                style={{ fontFamily: 'Impact, sans-serif' }}
              >
                JOIN NOW!!! <ArrowRight className="ml-2" />
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.1, rotate: 5 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                className="bg-[#f7dc6f] hover:bg-[#f4d03f] text-black border-8 border-black font-black text-2xl px-12 py-8 h-auto transform -rotate-1 shadow-[8px_8px_0_#000]"
                style={{ fontFamily: 'Impact, sans-serif' }}
              >
                LEARN MORE
              </Button>
            </motion.div>
          </div>
        </div>

        {/* FEATURES - SCATTERED CHAOS */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {[
              { title: 'POOLED SUPPORT', desc: 'Your monthly donation splits into weekly pools. Everyone draws from the community fund.', color: '#4ecdc4', rotate: 2 },
              { title: 'FAIR ALLOWANCES', desc: 'Equal access to weekly allowance. Reset every week. First-come basis. No judgment.', color: '#f7dc6f', rotate: -3 },
              { title: 'INSTANT CODES', desc: 'Generate secure code via GET Tools. Redeem at any dining location. Expires in minutes.', color: '#e74c3c', rotate: 1 },
              { title: 'PRIVACY FIRST', desc: 'Donors don\'t see requesters. Anonymous giving and receiving. Complete dignity.', color: '#2ecc71', rotate: -2 }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.05, rotate: 0 }}
                className="relative"
              >
                <div
                  className="bg-white border-8 border-black p-8 transform relative z-10"
                  style={{ transform: `rotate(${feature.rotate}deg)` }}
                >
                  <div
                    className="w-20 h-20 mb-6 border-8 border-black transform rotate-45"
                    style={{ backgroundColor: feature.color }}
                  />
                  <h3 className="text-4xl font-black mb-4" style={{ fontFamily: 'Impact, sans-serif' }}>
                    {feature.title}
                  </h3>
                  <p className="text-xl font-bold leading-relaxed" style={{ fontFamily: 'Arial Black, sans-serif' }}>
                    {feature.desc}
                  </p>
                </div>
                <div
                  className="absolute top-4 left-4 w-full h-full border-8 border-black z-0"
                  style={{ backgroundColor: feature.color }}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* TESTIMONIALS - OVERLAPPING MADNESS */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="relative">
            {[
              { quote: '"I had 500 points expiring. Now they\'re feeding people!"', name: 'MAYA', color: '#f7dc6f', rotate: -2, top: 0, left: 0 },
              { quote: '"No more choosing between textbooks and food!"', name: 'JORDAN', color: '#4ecdc4', rotate: 3, top: 120, left: 200 },
              { quote: '"Most equitable system on campus!"', name: 'ALEX', color: '#e74c3c', rotate: -1, top: 240, left: 100 }
            ].map((test, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                whileHover={{ scale: 1.1, rotate: 0, zIndex: 50 }}
                className="absolute md:relative bg-white border-8 border-black p-8 max-w-md transform"
                style={{
                  transform: `rotate(${test.rotate}deg)`,
                  top: test.top,
                  left: test.left,
                  backgroundColor: test.color,
                  marginBottom: i < 2 ? '80px' : '0'
                }}
              >
                <p className="text-2xl font-black mb-4" style={{ fontFamily: 'Impact, sans-serif' }}>
                  {test.quote}
                </p>
                <p className="text-xl font-bold" style={{ fontFamily: 'Arial Black, sans-serif' }}>
                  — {test.name}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* FINAL CTA - EXPLOSIVE */}
        <div className="max-w-5xl mx-auto text-center mb-20 mt-[500px] md:mt-20">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="bg-black text-white p-16 border-8 border-[#f7dc6f] relative z-20">
              <h2 className="text-6xl md:text-8xl font-black mb-8" style={{ fontFamily: 'Impact, sans-serif' }}>
                JOIN THE<br/>MOVEMENT!!!
              </h2>
              <p className="text-2xl font-bold mb-12" style={{ fontFamily: 'Arial Black, sans-serif' }}>
                EVERY STUDENT DESERVES MEALS
              </p>
              <motion.div whileHover={{ scale: 1.15, rotate: 5 }}>
                <Button
                  size="lg"
                  className="bg-[#e74c3c] hover:bg-[#c0392b] text-white border-8 border-white font-black text-3xl px-16 py-10 h-auto transform shadow-[12px_12px_0_#f7dc6f]"
                  style={{ fontFamily: 'Impact, sans-serif' }}
                >
                  DOWNLOAD NOW!!!
                </Button>
              </motion.div>
            </div>
            <div className="absolute top-8 left-8 w-full h-full bg-[#4ecdc4] border-8 border-black transform rotate-3 z-10" />
            <div className="absolute top-16 left-16 w-full h-full bg-[#f7dc6f] border-8 border-black transform -rotate-2 z-0" />
          </motion.div>
        </div>
      </div>

      {/* FLOATING CHAOS ELEMENTS */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={`float-${i}`}
          className="absolute border-4 border-black"
          style={{
            width: Math.random() * 80 + 40,
            height: Math.random() * 80 + 40,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            backgroundColor: ['#4ecdc4', '#f7dc6f', '#e74c3c', '#9b59b6', '#2ecc71'][Math.floor(Math.random() * 5)],
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
          }}
          animate={{
            y: [0, -30, 0],
            rotate: [0, 360],
          }}
          transition={{
            duration: Math.random() * 5 + 5,
            repeat: Infinity,
            delay: Math.random() * 2,
          }}
        />
      ))}
    </div>
  );
}
