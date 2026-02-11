'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';

export default function Experimental() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const rotateX = useTransform(scrollYProgress, [0, 1], [0, 360]);
  const rotateY = useTransform(scrollYProgress, [0, 1], [0, 180]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.2, 1]);

  return (
    <div ref={containerRef} className="min-h-[300vh] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 overflow-hidden">
      {/* Floating glass orbs background */}
      <div className="fixed inset-0 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-64 h-64 rounded-full"
            style={{
              background: `radial-gradient(circle at 30% 30%, rgba(${i % 2 === 0 ? '139, 92, 246' : '236, 72, 153'}, 0.3), transparent)`,
              backdropFilter: 'blur(40px)',
              left: `${(i * 15) % 80}%`,
              top: `${(i * 20) % 80}%`,
            }}
            animate={{
              y: [0, -100, 0],
              x: [0, 50, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 8 + i,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Main content wrapper with perspective */}
      <div className="relative z-10 px-6 md:px-12 py-20" style={{ perspective: '2000px' }}>
        <div className="max-w-7xl mx-auto">

          {/* Hero Section - 3D Isometric Card */}
          <motion.div
            style={{
              rotateX,
              rotateY,
              scale,
              transformStyle: 'preserve-3d',
            }}
            className="mb-32"
          >
            <div
              className="relative bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-12 md:p-20"
              style={{
                transform: 'translateZ(100px)',
                boxShadow: '0 50px 100px -20px rgba(0, 0, 0, 0.5), inset 0 0 100px rgba(255, 255, 255, 0.05)',
              }}
            >
              {/* Neumorphic inner glow */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 to-transparent opacity-50" />

              <motion.div
                initial={{ opacity: 0, z: -100 }}
                animate={{ opacity: 1, z: 0 }}
                transition={{ duration: 1, delay: 0.3 }}
                style={{ transformStyle: 'preserve-3d' }}
                className="relative z-10"
              >
                <motion.div
                  className="inline-block mb-6 px-6 py-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm border border-purple-400/30 rounded-full text-purple-300 text-sm font-bold"
                  whileHover={{ scale: 1.05, rotateZ: 2 }}
                  style={{ transform: 'translateZ(20px)' }}
                >
                  ✨ NEXT-GEN CAMPUS SHARING
                </motion.div>

                <h1
                  className="text-6xl md:text-8xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400"
                  style={{
                    transform: 'translateZ(50px)',
                    textShadow: '0 0 80px rgba(168, 85, 247, 0.5)',
                  }}
                >
                  Share dining points.<br />
                  <span className="text-white">Fast, fair, simple.</span>
                </h1>

                <p
                  className="text-2xl text-gray-300 mb-12 max-w-3xl leading-relaxed"
                  style={{ transform: 'translateZ(30px)' }}
                >
                  SlugSwap turns unused dining points into shared community support. Pooled weekly model. Anonymous giving. Instant claim codes.
                </p>

                <motion.div
                  whileHover={{ scale: 1.05, rotateX: 5, rotateY: -5 }}
                  style={{ transform: 'translateZ(60px)', transformStyle: 'preserve-3d' }}
                >
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xl px-12 py-8 h-auto rounded-2xl shadow-2xl"
                    style={{
                      boxShadow: '0 20px 60px rgba(168, 85, 247, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    Download SlugSwap
                  </Button>
                </motion.div>
              </motion.div>

              {/* Floating depth layers */}
              <div className="absolute -right-20 -top-20 w-96 h-96 bg-gradient-to-br from-purple-500/30 to-transparent rounded-full blur-3xl" style={{ transform: 'translateZ(-50px)' }} />
              <div className="absolute -left-20 -bottom-20 w-96 h-96 bg-gradient-to-br from-pink-500/30 to-transparent rounded-full blur-3xl" style={{ transform: 'translateZ(-50px)' }} />
            </div>
          </motion.div>

          {/* Stats Section - Isometric Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-32">
            {[
              { number: '2,847', label: 'Meals Shared', color: 'from-purple-500 to-purple-600', delay: 0 },
              { number: '412', label: 'Active Donors', color: 'from-pink-500 to-pink-600', delay: 0.1 },
              { number: '73%', label: 'Reduced Food Insecurity', color: 'from-cyan-500 to-cyan-600', delay: 0.2 },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, rotateX: -90 }}
                whileInView={{ opacity: 1, rotateX: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: stat.delay }}
                whileHover={{
                  rotateY: 10,
                  rotateX: -10,
                  scale: 1.05,
                  z: 50,
                }}
                className="relative group cursor-pointer"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div
                  className={`relative bg-gradient-to-br ${stat.color} p-12 rounded-3xl`}
                  style={{
                    transform: 'translateZ(0)',
                    boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  }}
                >
                  {/* Neumorphic effect */}
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative z-10" style={{ transform: 'translateZ(20px)' }}>
                    <div className="text-7xl font-black text-white mb-4">
                      {stat.number}
                    </div>
                    <div className="text-xl text-white/90 font-semibold">
                      {stat.label}
                    </div>
                  </div>

                  {/* Floating particle effect */}
                  <motion.div
                    className="absolute top-4 right-4 w-4 h-4 bg-white/50 rounded-full"
                    animate={{
                      y: [-10, 10, -10],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    style={{ transform: 'translateZ(30px)' }}
                  />
                </div>

                {/* 3D shadow layer */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${stat.color} rounded-3xl opacity-30 blur-xl`}
                  style={{ transform: 'translateZ(-20px)' }}
                />
              </motion.div>
            ))}
          </div>

          {/* How It Works - Depth Layers */}
          <div className="mb-32">
            <motion.h2
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-6xl font-black text-center mb-20 text-white"
              style={{
                textShadow: '0 0 60px rgba(168, 85, 247, 0.5)',
              }}
            >
              How It Works
            </motion.h2>

            <div className="grid md:grid-cols-2 gap-16">
              {/* For Donors */}
              <div className="space-y-8">
                <div className="text-3xl font-black text-purple-400 mb-8">For Donors</div>
                {[
                  { step: '01', title: 'Set Your Contribution', desc: 'Choose monthly points to share' },
                  { step: '02', title: 'Watch Your Impact', desc: 'Track community stats and pool balances' },
                  { step: '03', title: 'That\'s It', desc: 'Support flows automatically every week' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -100, rotateY: -90 }}
                    whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                    whileHover={{ x: 20, rotateY: 5, scale: 1.02 }}
                    className="relative group"
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <div
                      className="relative bg-white/5 backdrop-blur-xl border border-white/10 group-hover:border-purple-400/50 rounded-2xl p-8 transition-all duration-300"
                      style={{
                        transform: 'translateZ(0)',
                        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <div className="flex gap-6 items-start">
                        <div
                          className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-pink-400 flex-shrink-0"
                          style={{ transform: 'translateZ(20px)' }}
                        >
                          {item.step}
                        </div>
                        <div style={{ transform: 'translateZ(10px)' }}>
                          <h3 className="text-2xl font-bold text-white mb-2">{item.title}</h3>
                          <p className="text-gray-400 text-lg">{item.desc}</p>
                        </div>
                      </div>

                      {/* Micro-interaction glow */}
                      <motion.div
                        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/0 via-purple-500/20 to-purple-500/0 opacity-0 group-hover:opacity-100"
                        animate={{
                          x: ['-100%', '100%'],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* For Requesters */}
              <div className="space-y-8">
                <div className="text-3xl font-black text-pink-400 mb-8">For Requesters</div>
                {[
                  { step: '01', title: 'Check Allowance', desc: 'See weekly points from community pool' },
                  { step: '02', title: 'Generate Code', desc: 'Instant secure code via GET Tools' },
                  { step: '03', title: 'Redeem & Eat', desc: 'Use at any dining location immediately' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 100, rotateY: 90 }}
                    whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                    whileHover={{ x: -20, rotateY: -5, scale: 1.02 }}
                    className="relative group"
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <div
                      className="relative bg-white/5 backdrop-blur-xl border border-white/10 group-hover:border-pink-400/50 rounded-2xl p-8 transition-all duration-300"
                      style={{
                        transform: 'translateZ(0)',
                        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <div className="flex gap-6 items-start">
                        <div
                          className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-pink-400 to-cyan-400 flex-shrink-0"
                          style={{ transform: 'translateZ(20px)' }}
                        >
                          {item.step}
                        </div>
                        <div style={{ transform: 'translateZ(10px)' }}>
                          <h3 className="text-2xl font-bold text-white mb-2">{item.title}</h3>
                          <p className="text-gray-400 text-lg">{item.desc}</p>
                        </div>
                      </div>

                      {/* Micro-interaction glow */}
                      <motion.div
                        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-pink-500/0 via-pink-500/20 to-pink-500/0 opacity-0 group-hover:opacity-100"
                        animate={{
                          x: ['100%', '-100%'],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Testimonials - Floating Cards with Parallax */}
          <div className="mb-32">
            <motion.h2
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-6xl font-black text-center mb-20 text-white"
            >
              What Students Say
            </motion.h2>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { name: 'Maya T.', role: 'Junior, Donor', quote: 'I had 500 points I wasn\'t going to use before the semester ended. Knowing they\'re actually feeding people instead of expiring feels incredible.', depth: 0 },
                { name: 'Jordan L.', role: 'Sophomore, Requester', quote: 'No more choosing between textbooks and groceries. SlugSwap means I can actually eat three meals a day without guilt or asking friends for money.', depth: 30 },
                { name: 'Alex R.', role: 'Senior, Both', quote: 'The weekly reset is genius. Everyone gets a fair chance, and the pool never runs dry because donations keep coming in.', depth: 60 },
              ].map((testimonial, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 100, rotateX: -45 }}
                  whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: i * 0.15 }}
                  whileHover={{
                    y: -20,
                    rotateX: 5,
                    rotateY: 5,
                    scale: 1.05,
                  }}
                  className="relative"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: `translateZ(${testimonial.depth}px)`,
                  }}
                >
                  <div
                    className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/20 rounded-3xl p-8"
                    style={{
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    {/* Quote mark with depth */}
                    <div
                      className="text-8xl text-purple-400/30 mb-4 leading-none"
                      style={{ transform: 'translateZ(15px)' }}
                    >
                      "
                    </div>

                    <p
                      className="text-gray-300 mb-6 leading-relaxed text-lg"
                      style={{ transform: 'translateZ(10px)' }}
                    >
                      {testimonial.quote}
                    </p>

                    <div
                      className="border-t border-white/20 pt-4"
                      style={{ transform: 'translateZ(5px)' }}
                    >
                      <div className="font-bold text-white text-lg">{testimonial.name}</div>
                      <div className="text-gray-400 text-sm">{testimonial.role}</div>
                    </div>

                    {/* Neumorphic inner shadow */}
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-transparent via-white/5 to-transparent pointer-events-none" />
                  </div>

                  {/* Floating shadow layer */}
                  <div
                    className="absolute inset-0 bg-purple-500/20 rounded-3xl blur-2xl opacity-50"
                    style={{ transform: 'translateZ(-30px)' }}
                  />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Final CTA - Massive 3D Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotateX: -90 }}
            whileInView={{ opacity: 1, scale: 1, rotateX: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="text-center"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div
              className="relative inline-block bg-gradient-to-br from-purple-600 via-pink-600 to-cyan-600 p-1 rounded-[3rem]"
              style={{
                transform: 'translateZ(80px)',
                boxShadow: '0 50px 100px -20px rgba(168, 85, 247, 0.6)',
              }}
            >
              <div className="bg-slate-900 rounded-[2.8rem] px-20 py-16">
                <h2
                  className="text-5xl md:text-7xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400"
                  style={{
                    transform: 'translateZ(40px)',
                    textShadow: '0 0 80px rgba(168, 85, 247, 0.5)',
                  }}
                >
                  Your Campus<br />Community<br />Needs You
                </h2>

                <p
                  className="text-2xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed"
                  style={{ transform: 'translateZ(30px)' }}
                >
                  Every student deserves reliable access to meals. Join the community making that happen.
                </p>

                <motion.div
                  whileHover={{
                    scale: 1.1,
                    rotateX: 10,
                    rotateY: 10,
                  }}
                  whileTap={{ scale: 0.95 }}
                  style={{ transform: 'translateZ(50px)' }}
                >
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-2xl px-16 py-10 h-auto rounded-3xl"
                    style={{
                      boxShadow: '0 30px 60px rgba(168, 85, 247, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    DOWNLOAD SLUGSWAP NOW
                  </Button>
                </motion.div>

                <p
                  className="text-gray-500 mt-8 text-sm"
                  style={{ transform: 'translateZ(20px)' }}
                >
                  Available for iOS • Free to Use • Works with Your Campus GET Account
                </p>
              </div>
            </div>

            {/* Orbiting particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-4 h-4 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full"
                style={{
                  left: '50%',
                  top: '50%',
                }}
                animate={{
                  x: [0, Math.cos((i / 6) * Math.PI * 2) * 200, 0],
                  y: [0, Math.sin((i / 6) * Math.PI * 2) * 200, 0],
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>

        </div>
      </div>
    </div>
  );
}
