'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Users, Shield, Zap } from 'lucide-react';
import { Waves } from '@/components/ui/wave-background';

export default function HeroBold() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero Section with Wave Background */}
      <section className="relative min-h-screen flex items-center px-6 md:px-12 py-20 overflow-hidden">
        {/* Wave Background - Only in Hero Section */}
        <div className="absolute inset-0 opacity-15">
          <Waves
            strokeColor="#ffed4e"
            backgroundColor="#000000"
            pointerSize={0.3}
          />
        </div>

        {/* Content Layer - Above Wave Background */}
        <div className="relative z-10 max-w-7xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8"
          >
            <div className="inline-block px-6 py-2 border-2 border-white text-sm font-bold uppercase tracking-wider">
              SlugSwap
            </div>
          </motion.div>

          <div className="mb-12 space-y-4">
            <motion.h1
              initial={{ opacity: 0, y: -100 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="font-black uppercase text-7xl md:text-9xl leading-[0.9] tracking-tighter text-[#ffed4e]"
            >
              Share
            </motion.h1>
            <motion.h1
              initial={{ opacity: 0, y: -100 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="font-black uppercase text-7xl md:text-9xl leading-[0.9] tracking-tighter"
            >
              dining
            </motion.h1>
            <motion.h1
              initial={{ opacity: 0, y: -100 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="font-black uppercase text-7xl md:text-9xl leading-[0.9] tracking-tighter text-[#3b82f6]"
            >
              points.
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="max-w-2xl mb-16"
          >
            <p className="text-3xl font-semibold leading-relaxed mb-8">
              Fast, fair, and simple.
            </p>
            <p className="text-xl text-gray-300 leading-relaxed">
              SlugSwap turns unused dining points into shared support. Donate what you don't need, access meals when you're running low—all through your campus community.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6 }}
          >
            <Button
              size="lg"
              className="bg-[#ffed4e] hover:bg-[#ffed4e]/90 text-black border-4 border-black shadow-[8px_8px_0_rgba(255,237,78,0.3)] hover:shadow-[4px_4px_0_rgba(255,237,78,0.3)] hover:translate-x-1 hover:translate-y-1 transition-all text-lg font-bold uppercase tracking-wide h-14 px-12"
            >
              Become a Beta Tester
            </Button>
          </motion.div>
        </div>

        {/* Decorative Elements */}
        <motion.div
          animate={{ rotate: [12, 18, 12] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 right-10 w-32 h-32 border-4 border-[#ef4444] opacity-20"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-40 left-10 w-24 h-24 bg-[#3b82f6] opacity-20 rounded-full"
        />
      </section>

      {/* Trust Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="bg-[#ffed4e] text-black py-6 border-t-4 border-b-4 border-white"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-wrap justify-center gap-8 text-sm font-bold uppercase tracking-wider">
            <span>Built by students, for students</span>
            <span className="hidden md:inline">•</span>
            <span>Fair weekly pools</span>
            <span className="hidden md:inline">•</span>
            <span>Secure & transparent</span>
          </div>
        </div>
      </motion.div>

      {/* Features Grid */}
      <section className="py-32 px-6 md:px-12 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start gap-8 mb-20">
            <span className="hidden lg:block text-[#ffed4e] font-black text-2xl uppercase [writing-mode:vertical-rl] tracking-widest">
              FEATURES
            </span>
            <h2 className="font-black text-5xl md:text-7xl max-w-4xl uppercase leading-tight">
              No awkward asks. No tracking debts.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: <Users className="w-8 h-8" />,
                color: '#ffed4e',
                title: 'Pooled Weekly Support',
                description: 'Your monthly donation is split into weekly pools. Everyone draws from the same community fund—no individual transactions, no pressure.'
              },
              {
                icon: <Shield className="w-8 h-8" />,
                color: '#3b82f6',
                title: 'Fair Weekly Allowances',
                description: 'Request what you need, when you need it. Everyone gets equal access to their weekly allowance. Reset every week so everyone gets a fair shot.'
              },
              {
                icon: <Zap className="w-8 h-8" />,
                color: '#ef4444',
                title: 'Instant Claim Codes',
                description: 'Generate a secure code through your school\'s GET Tools system in seconds. Redeem at any campus dining location immediately.'
              },
              {
                icon: <Shield className="w-8 h-8" />,
                color: 'white',
                title: 'Privacy Protected',
                description: 'Donors don\'t see who requests. Just a community supporting each other, anonymously and with dignity.'
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{
                  y: -4,
                  boxShadow: `8px 8px 0 ${feature.color}33`
                }}
                className="border-3 border-white p-8 md:p-12 relative transition-all group"
              >
                <div
                  className="w-16 h-16 mb-6 flex items-center justify-center"
                  style={{ backgroundColor: feature.color }}
                >
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-bold mb-4 uppercase tracking-wide">
                  {feature.title}
                </h3>
                <p className="text-gray-300 text-lg leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 md:px-12 bg-[#ffed4e] text-black">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-black text-5xl md:text-7xl mb-8 uppercase leading-tight"
          >
            Your campus community needs you
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto"
          >
            Every student deserves reliable access to meals. Join the community making that happen.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/90 px-16 py-6 text-xl font-bold uppercase border-4 border-black shadow-lg hover:shadow-xl h-auto"
            >
              Download SlugSwap Now <ArrowRight className="ml-2" />
            </Button>
          </motion.div>
          <p className="mt-8 text-sm font-semibold uppercase tracking-wider opacity-70">
            Available for iOS • Free to use • Works with your campus GET account
          </p>
        </div>
      </section>
    </div>
  );
}
