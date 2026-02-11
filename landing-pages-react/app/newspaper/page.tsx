'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function Newspaper() {
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Newspaper Masthead */}
      <div className="border-b-8 border-black">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between mb-6">
            <div className="text-xs space-y-1">
              <div>VOL. 1, No. 1</div>
              <div>MONDAY, FEBRUARY 10, 2026</div>
            </div>
            <div className="text-xs text-right space-y-1">
              <div>CAMPUS EDITION</div>
              <div>FREE</div>
            </div>
          </div>

          <div className="text-center border-t-4 border-b-4 border-black py-6 mb-4">
            <h1
              className="text-7xl md:text-9xl font-black leading-none mb-2"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              THE SLUGSWAP
            </h1>
            <div className="text-sm tracking-widest" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
              "ALL THE POINTS FIT TO SHARE"
            </div>
          </div>

          <div className="flex justify-between text-xs border-b-2 border-black pb-2">
            <div>CAMPUS COMMUNITY NEWS</div>
            <div>ESTABLISHED 2026</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Lead Story */}
        <div className="grid md:grid-cols-3 gap-12 mb-16 border-b-4 border-black pb-16">
          {/* Main Column */}
          <div className="md:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="text-xs mb-2 font-bold tracking-wider" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                BREAKING NEWS
              </div>
              <h2
                className="text-6xl md:text-7xl font-black leading-none mb-6"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                Revolutionary System Eliminates Campus Food Insecurity
              </h2>

              <div className="text-sm mb-6 font-bold" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                SlugSwap Launches Pooled Dining Point Sharing Platform — "Fast, Fair, and Simple"
              </div>

              <div className="border-l-4 border-[#dc2626] pl-6 mb-8 bg-gray-50 p-6">
                <p className="text-2xl leading-relaxed" style={{ fontFamily: 'Playfair Display, serif' }}>
                  "No student should skip meals while dining points sit unused. This changes everything."
                </p>
                <div className="mt-4 text-sm font-bold" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                  — Campus Food Security Coalition
                </div>
              </div>

              <div className="columns-2 gap-8 text-justify leading-relaxed" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                <p className="mb-4">
                  <span className="text-6xl float-left mr-2 leading-none font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>I</span>
                  n a groundbreaking move, students have launched SlugSwap, a revolutionary platform that turns unused dining points into shared community support. The system operates on a simple principle: donors contribute to a shared weekly pool, requesters draw from a weekly allowance via short-lived claim codes.
                </p>
                <p className="mb-4">
                  The pooled weekly model ensures fairness. Monthly contributions are automatically divided into weekly pools. Requesters get equal access to a weekly allowance, with automatic Monday resets ensuring everyone gets a fair shot.
                </p>
                <p className="mb-4">
                  "I had 500 points I wasn't going to use before the semester ended," says Maya T., a junior donor. "Knowing they're actually feeding people instead of expiring feels incredible."
                </p>
                <p className="mb-4">
                  The system integrates with the campus GET Tools API, generating secure codes in seconds. Codes are short-lived to prevent abuse and can be redeemed at any campus dining location immediately.
                </p>
              </div>
            </motion.div>
          </div>

          {/* Sidebar Stats */}
          <div className="border-l-4 border-black pl-8">
            <div className="bg-black text-white p-6 mb-8">
              <div className="text-xs mb-4 tracking-widest">BY THE NUMBERS</div>
              <div className="space-y-6">
                <div>
                  <div className="text-6xl font-black" style={{ fontFamily: 'Playfair Display, serif' }}>2,847</div>
                  <div className="text-sm">Meals Shared This Month</div>
                </div>
                <div>
                  <div className="text-6xl font-black" style={{ fontFamily: 'Playfair Display, serif' }}>412</div>
                  <div className="text-sm">Active Donors</div>
                </div>
                <div>
                  <div className="text-6xl font-black" style={{ fontFamily: 'Playfair Display, serif' }}>73%</div>
                  <div className="text-sm">Reduced Food Insecurity</div>
                </div>
              </div>
            </div>

            <div className="border-4 border-[#dc2626] p-6 mb-8">
              <div className="text-xs mb-3 font-bold tracking-widest text-[#dc2626]">SPECIAL REPORT</div>
              <h3 className="text-2xl font-black mb-3" style={{ fontFamily: 'Playfair Display, serif' }}>
                Privacy First: How Anonymous Giving Works
              </h3>
              <p className="text-sm leading-relaxed">
                Donors never see who requests. Recipients never know who gave. Just a community supporting each other with complete dignity.
              </p>
            </div>

            <div className="bg-gray-100 p-6">
              <div className="text-xs mb-3 font-bold tracking-widest">OPINION</div>
              <p className="text-sm italic leading-relaxed" style={{ fontFamily: 'Playfair Display, serif' }}>
                "The weekly reset is genius. Everyone gets a fair chance, and the pool never runs dry. It's the most equitable system I've seen on campus."
              </p>
              <div className="text-xs mt-3 font-bold">— Alex R., Senior</div>
            </div>
          </div>
        </div>

        {/* Feature Stories Grid */}
        <div className="grid md:grid-cols-4 gap-8 mb-16 border-b-2 border-black pb-16">
          <div>
            <div className="bg-black text-white px-3 py-2 mb-3 text-xs font-bold tracking-widest">
              FEATURES
            </div>
            <h3 className="text-2xl font-black mb-3 leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
              Pooled Weekly Support
            </h3>
            <p className="text-sm leading-relaxed">
              Monthly donations split automatically. Community fund access. Zero individual transactions. No pressure.
            </p>
          </div>

          <div>
            <div className="bg-black text-white px-3 py-2 mb-3 text-xs font-bold tracking-widest">
              TECHNOLOGY
            </div>
            <h3 className="text-2xl font-black mb-3 leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
              Instant Claim Codes
            </h3>
            <p className="text-sm leading-relaxed">
              GET Tools integration. Sub-second generation. Campus-wide redemption. Time-locked security.
            </p>
          </div>

          <div>
            <div className="bg-black text-white px-3 py-2 mb-3 text-xs font-bold tracking-widest">
              POLICY
            </div>
            <h3 className="text-2xl font-black mb-3 leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
              Fair Allowances
            </h3>
            <p className="text-sm leading-relaxed">
              Equal weekly access. Monday resets. First-come distribution. No judgment protocol.
            </p>
          </div>

          <div className="border-4 border-[#dc2626] p-6">
            <div className="text-xs mb-3 font-bold tracking-widest text-[#dc2626]">
              URGENT
            </div>
            <h3 className="text-xl font-black mb-3" style={{ fontFamily: 'Playfair Display, serif' }}>
              Join Now
            </h3>
            <p className="text-sm mb-4">
              Your campus community needs you.
            </p>
            <Button className="w-full bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold">
              SUBSCRIBE
            </Button>
          </div>
        </div>

        {/* Testimonials as Classified Ads */}
        <div className="border-4 border-black p-8 mb-16">
          <div className="text-center mb-8">
            <div className="text-xs font-bold tracking-widest mb-2">COMMUNITY NOTICES</div>
            <div className="text-sm">Letters from Our Readers</div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: 'MAYA T.',
                role: 'Junior, Donor',
                quote: 'I had 500 points I wasn\'t going to use before the semester ended. Knowing they\'re actually feeding people instead of expiring feels incredible.',
              },
              {
                name: 'JORDAN L.',
                role: 'Sophomore, Requester',
                quote: 'No more choosing between textbooks and groceries. SlugSwap means I can actually eat three meals a day without guilt or asking friends for money.',
              },
              {
                name: 'ALEX R.',
                role: 'Senior, Both',
                quote: 'The weekly reset is genius. Everyone gets a fair chance, and the pool never runs dry because donations keep coming in.',
              },
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="border-2 border-black p-6 bg-gray-50"
              >
                <div className="text-4xl mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>"</div>
                <p className="text-sm leading-relaxed mb-4 italic">
                  {testimonial.quote}
                </p>
                <div className="border-t-2 border-black pt-3">
                  <div className="font-bold text-sm">{testimonial.name}</div>
                  <div className="text-xs">{testimonial.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* How It Works - Explainer */}
        <div className="grid md:grid-cols-2 gap-16 mb-16 border-b-2 border-black pb-16">
          <div>
            <div className="bg-black text-white px-4 py-2 mb-6 inline-block text-xs font-bold tracking-widest">
              FOR DONORS
            </div>
            <ol className="space-y-6">
              {[
                { step: 'I.', title: 'Set Your Contribution', desc: 'Choose monthly points to share. Auto-splits into weekly pools.' },
                { step: 'II.', title: 'Watch Your Impact', desc: 'Track community stats, pool balances, meals shared.' },
                { step: 'III.', title: 'That\'s It', desc: 'Set and forget. Support flows automatically every week.' },
              ].map((item, i) => (
                <li key={i} className="flex gap-6">
                  <div className="text-5xl font-black flex-shrink-0" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {item.step}
                  </div>
                  <div>
                    <h4 className="text-xl font-black mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                      {item.title}
                    </h4>
                    <p className="text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="bg-black text-white px-4 py-2 mb-6 inline-block text-xs font-bold tracking-widest">
              FOR REQUESTERS
            </div>
            <ol className="space-y-6">
              {[
                { step: 'I.', title: 'Check Allowance', desc: 'See weekly points available from community pool.' },
                { step: 'II.', title: 'Generate Code', desc: 'Instant secure code via GET Tools. Valid for minutes.' },
                { step: 'III.', title: 'Redeem & Eat', desc: 'Use at any dining location. No questions asked.' },
              ].map((item, i) => (
                <li key={i} className="flex gap-6">
                  <div className="text-5xl font-black flex-shrink-0" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {item.step}
                  </div>
                  <div>
                    <h4 className="text-xl font-black mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                      {item.title}
                    </h4>
                    <p className="text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Final CTA - Front Page Banner */}
        <div className="border-8 border-[#dc2626] p-12 text-center bg-gray-50">
          <div className="text-xs mb-4 font-bold tracking-widest">SPECIAL ANNOUNCEMENT</div>
          <h2 className="text-5xl md:text-7xl font-black mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Your Campus<br />Community<br />Needs You
          </h2>
          <p className="text-xl mb-8 max-w-3xl mx-auto leading-relaxed">
            Every student deserves reliable access to meals. Join the community making that happen.
          </p>
          <Button
            size="lg"
            className="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xl px-12 py-6 h-auto"
          >
            DOWNLOAD SLUGSWAP NOW
          </Button>
          <p className="text-xs mt-6">
            Available for iOS • Free to Use • Works with Your Campus GET Account
          </p>
        </div>

        {/* Footer Dateline */}
        <div className="mt-16 pt-8 border-t-4 border-black text-xs text-center">
          <div>© 2026 THE SLUGSWAP | Campus Community News</div>
          <div className="mt-2">Published Daily | Established February 2026 | Vol. 1, No. 1</div>
        </div>
      </div>
    </div>
  );
}
