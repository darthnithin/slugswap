'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function Collision() {
  return (
    <div className="min-h-screen bg-[#0a1128] overflow-hidden relative">
      {/* Diagonal split background */}
      <div className="absolute inset-0">
        {/* Warm zone - diagonal from top-left */}
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
          className="absolute inset-0 bg-gradient-to-br from-[#ff6b35] via-[#feca57] to-[#ff6b35]"
          style={{
            clipPath: 'polygon(0 0, 65% 0, 35% 100%, 0 100%)',
          }}
        />

        {/* Cool zone - diagonal from bottom-right */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
          className="absolute inset-0 bg-gradient-to-br from-[#0a1128] via-[#00d9ff] to-[#0a1128]"
          style={{
            clipPath: 'polygon(65% 0, 100% 0, 100% 100%, 35% 100%)',
          }}
        />

        {/* Collision line */}
        <div
          className="absolute inset-0 bg-white"
          style={{
            clipPath: 'polygon(63% 0, 67% 0, 37% 100%, 33% 100%)',
          }}
        />
      </div>

      {/* Floating geometric chaos */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              width: Math.random() * 150 + 50,
              height: Math.random() * 150 + 50,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: ['#ff6b35', '#00d9ff', '#feca57', '#fff'][Math.floor(Math.random() * 4)],
              opacity: Math.random() * 0.3 + 0.1,
              rotate: `${Math.random() * 360}deg`,
            }}
            animate={{
              x: [0, Math.random() * 200 - 100],
              y: [0, Math.random() * 200 - 100],
              rotate: [0, Math.random() * 360],
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              repeatType: 'reverse',
              ease: 'linear',
            }}
          />
        ))}
      </div>

      {/* Content wrapper */}
      <div className="relative z-10 min-h-screen flex items-center px-6 md:px-12 py-20">
        <div className="max-w-7xl mx-auto w-full">

          {/* Hero - fragmented across diagonal */}
          <div className="relative mb-32">
            {/* SLUG on warm side */}
            <motion.div
              initial={{ opacity: 0, x: -200, rotate: -15 }}
              animate={{ opacity: 1, x: 0, rotate: -8 }}
              transition={{ duration: 1, delay: 0.3 }}
              className="relative inline-block"
              style={{
                fontFamily: 'Archivo Black, sans-serif',
              }}
            >
              <h1
                className="text-[12rem] md:text-[20rem] font-black leading-none text-[#0a1128]"
                style={{
                  textShadow: '8px 8px 0px #feca57, -4px -4px 0px #fff',
                }}
              >
                SLUG
              </h1>
            </motion.div>

            {/* SWAP on cool side - overlapping and offset */}
            <motion.div
              initial={{ opacity: 0, x: 200, rotate: 15 }}
              animate={{ opacity: 1, x: 0, rotate: 5 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="relative inline-block ml-[-8rem] mt-[-4rem]"
              style={{
                fontFamily: 'Archivo Black, sans-serif',
              }}
            >
              <h1
                className="text-[12rem] md:text-[20rem] font-black leading-none text-white"
                style={{
                  textShadow: '8px 8px 0px #00d9ff, -4px -4px 0px #0a1128',
                }}
              >
                SWAP
              </h1>
            </motion.div>

            {/* Tagline breaking across zones */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="absolute -bottom-16 left-0 right-0"
            >
              <div className="flex items-center gap-4">
                <div
                  className="bg-white text-[#ff6b35] px-8 py-4 font-black text-3xl transform -rotate-2"
                  style={{ fontFamily: 'Archivo Black, sans-serif' }}
                >
                  SHARE DINING POINTS
                </div>
                <div
                  className="bg-[#00d9ff] text-[#0a1128] px-8 py-4 font-black text-3xl transform rotate-2"
                  style={{ fontFamily: 'Archivo Black, sans-serif' }}
                >
                  FAST FAIR SIMPLE
                </div>
              </div>
            </motion.div>
          </div>

          {/* Stats - colliding blocks */}
          <div className="grid md:grid-cols-3 gap-0 mb-32 relative">
            {[
              { num: '2,847', label: 'MEALS SHARED', bg: '#ff6b35', text: '#fff', rotate: -3, z: 30 },
              { num: '412', label: 'DONORS', bg: '#feca57', text: '#0a1128', rotate: 2, z: 20 },
              { num: '73%', label: 'LESS HUNGER', bg: '#00d9ff', text: '#0a1128', rotate: -1, z: 10 },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 100, rotate: 0 }}
                whileInView={{ opacity: 1, y: 0, rotate: stat.rotate }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{
                  rotate: stat.rotate + 5,
                  scale: 1.1,
                  zIndex: 50,
                }}
                className="relative p-12 cursor-pointer"
                style={{
                  background: stat.bg,
                  color: stat.text,
                  zIndex: stat.z,
                  marginLeft: i > 0 ? '-2rem' : 0,
                  boxShadow: `12px 12px 0px ${i === 0 ? '#0a1128' : i === 1 ? '#ff6b35' : '#feca57'}`,
                }}
              >
                <div
                  className="text-8xl font-black mb-4"
                  style={{ fontFamily: 'Archivo Black, sans-serif' }}
                >
                  {stat.num}
                </div>
                <div
                  className="text-2xl font-black tracking-wider"
                  style={{ fontFamily: 'Archivo Black, sans-serif' }}
                >
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>

          {/* How it works - diagonal flow */}
          <div className="mb-32 relative">
            <motion.h2
              initial={{ opacity: 0, x: -100 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-7xl md:text-9xl font-black mb-20 text-white transform -rotate-2"
              style={{
                fontFamily: 'Archivo Black, sans-serif',
                textShadow: '6px 6px 0px #ff6b35',
              }}
            >
              HOW IT<br />WORKS
            </motion.h2>

            {/* Donors - warm zone bias */}
            <div className="mb-16">
              <div
                className="inline-block bg-[#feca57] text-[#0a1128] px-6 py-3 mb-8 font-black text-2xl transform -rotate-1"
                style={{ fontFamily: 'Archivo Black, sans-serif' }}
              >
                FOR DONORS
              </div>

              <div className="space-y-6">
                {[
                  'Set monthly contribution → auto-splits weekly',
                  'Watch community impact grow in real-time',
                  'Set it and forget it. Support flows automatically.',
                ].map((text, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -100 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white/10 backdrop-blur-sm border-4 border-white p-8 transform hover:scale-105 transition-transform"
                    style={{
                      rotate: `${(i - 1) * 2}deg`,
                      fontFamily: 'Work Sans, sans-serif',
                    }}
                  >
                    <p className="text-white text-2xl font-semibold">{text}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Requesters - cool zone bias */}
            <div className="text-right">
              <div
                className="inline-block bg-[#00d9ff] text-[#0a1128] px-6 py-3 mb-8 font-black text-2xl transform rotate-1"
                style={{ fontFamily: 'Archivo Black, sans-serif' }}
              >
                FOR REQUESTERS
              </div>

              <div className="space-y-6">
                {[
                  'Check your weekly allowance from the pool',
                  'Generate instant secure claim code',
                  'Redeem at any dining hall. Zero questions.',
                ].map((text, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 100 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white/10 backdrop-blur-sm border-4 border-[#00d9ff] p-8 transform hover:scale-105 transition-transform"
                    style={{
                      rotate: `${(1 - i) * 2}deg`,
                      fontFamily: 'Work Sans, sans-serif',
                    }}
                  >
                    <p className="text-white text-2xl font-semibold">{text}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Testimonials - overlapping cards */}
          <div className="mb-32 relative">
            <motion.h2
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-7xl md:text-9xl font-black mb-20 text-[#00d9ff] transform rotate-2 text-right"
              style={{
                fontFamily: 'Archivo Black, sans-serif',
                textShadow: '6px 6px 0px #feca57',
              }}
            >
              REAL<br />VOICES
            </motion.h2>

            <div className="relative h-[600px] md:h-[400px]">
              {[
                { name: 'MAYA T.', quote: 'I had 500 points expiring. Now they feed people. Feels incredible.', bg: '#ff6b35', left: '0%', top: '0%', rotate: -5 },
                { name: 'JORDAN L.', quote: 'No more choosing between textbooks and meals. SlugSwap changed everything.', bg: '#feca57', left: '30%', top: '10%', rotate: 3 },
                { name: 'ALEX R.', quote: 'The weekly reset is genius. Fair chance for everyone.', bg: '#00d9ff', left: '60%', top: '5%', rotate: -2 },
              ].map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  whileHover={{ scale: 1.05, zIndex: 50, rotate: 0 }}
                  className="absolute w-full md:w-96 p-8 border-4 border-[#0a1128] cursor-pointer"
                  style={{
                    background: t.bg,
                    left: t.left,
                    top: t.top,
                    rotate: `${t.rotate}deg`,
                    boxShadow: '8px 8px 0px #0a1128',
                    fontFamily: 'Work Sans, sans-serif',
                  }}
                >
                  <p className="text-[#0a1128] text-xl mb-4 font-semibold leading-relaxed">
                    "{t.quote}"
                  </p>
                  <div
                    className="font-black text-lg"
                    style={{ fontFamily: 'Archivo Black, sans-serif' }}
                  >
                    — {t.name}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* CTA - explosive finale */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, type: 'spring' }}
            className="text-center relative"
          >
            <div className="bg-white p-16 border-8 border-[#0a1128] transform -rotate-1 relative overflow-hidden">
              {/* Animated stripes background */}
              <div className="absolute inset-0 opacity-10">
                {[...Array(10)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute h-full w-32 bg-[#ff6b35]"
                    style={{ left: `${i * 12}%` }}
                    animate={{
                      x: ['-100%', '100%'],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: 'linear',
                    }}
                  />
                ))}
              </div>

              <div className="relative z-10">
                <h2
                  className="text-5xl md:text-8xl font-black mb-8 text-[#0a1128]"
                  style={{
                    fontFamily: 'Archivo Black, sans-serif',
                    textShadow: '4px 4px 0px #feca57, -2px -2px 0px #00d9ff',
                  }}
                >
                  YOUR CAMPUS<br />NEEDS YOU
                </h2>
                <p className="text-2xl mb-12 text-[#0a1128] font-semibold max-w-3xl mx-auto" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  Every student deserves meals. Be part of the solution.
                </p>
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    size="lg"
                    className="bg-[#ff6b35] hover:bg-[#00d9ff] text-white border-4 border-[#0a1128] font-black text-2xl px-16 py-10 h-auto transform -rotate-1"
                    style={{
                      fontFamily: 'Archivo Black, sans-serif',
                      boxShadow: '8px 8px 0px #0a1128',
                    }}
                  >
                    DOWNLOAD NOW
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* Font loading */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Work+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
