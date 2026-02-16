'use client'

import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Link } from '@/components/catalyst/link'

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-neutral-800 flex flex-col">
            {/* Navbar */}
            <nav className="border-b border-neutral-700/50 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-primary-500 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">O</span>
                        </div>
                        <Heading level="5" className="text-white m-0">OghmaNotes</Heading>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-300 hover:text-white transition-colors">
                            Sign In
                        </Link>
                        <Button href="/register" color="dark/zinc" className="text-sm">
                            Get Started
                        </Button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-16 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <Heading level="1" className="text-5xl md:text-6xl font-bold text-white mb-6">
                        Study Smarter with <span className="text-primary-400">AI-Powered</span> Notes
                    </Heading>
                    <Text className="text-xl text-neutral-300 mb-8 max-w-3xl mx-auto">
                        Take rich notes, sync with Canvas, and get AI-powered insights to ace your exams.
                    </Text>
                    <div className="flex gap-4 justify-center flex-wrap">
                        <Button href="/register" color="dark/zinc" className="px-8">
                            Start Free
                        </Button>
                        <Button href="/login" outline className="px-8">
                            Sign In
                        </Button>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                    {[
                        {
                            icon: '✍️',
                            title: 'Rich Markdown Editor',
                            description: 'Write notes in beautiful Markdown with live preview and syntax highlighting.'
                        },
                        {
                            icon: '🔗',
                            title: 'Canvas Integration',
                            description: 'Auto-sync your notes from Canvas lectures. Never miss important material again.'
                        },
                        {
                            icon: '✨',
                            title: 'AI-Powered Insights',
                            description: 'Get summaries, key concepts, study questions—all powered by intelligent analysis.'
                        }
                    ].map((feature, idx) => (
                        <div
                            key={idx}
                            className="p-6 rounded-lg border border-neutral-700/50 bg-neutral-800/30 backdrop-blur hover:border-primary-500/50 transition-colors"
                        >
                            <div className="text-3xl mb-3">{feature.icon}</div>
                            <Heading level="3" className="text-white mb-2 text-lg">{feature.title}</Heading>
                            <Text className="text-neutral-400 text-sm">{feature.description}</Text>
                        </div>
                    ))}
                </div>
            </div>

            {/* Screenshot Section */}
            <div className="border-t border-neutral-700/50 bg-neutral-800/30 py-16">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <Heading level="2" className="text-3xl text-white mb-4">See OghmaNotes in action</Heading>
                        <Text className="text-neutral-300">Intuitive interface designed for modern students</Text>
                    </div>
                    <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/50 aspect-video flex items-center justify-center overflow-hidden">
                        <div className="text-center">
                            <svg className="w-16 h-16 mx-auto mb-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <Text className="text-neutral-400">Screenshot placeholder</Text>
                        </div>
                    </div>
                </div>
            </div>

            {/* Testimonials Section */}
            <div className="border-t border-neutral-700/50 bg-neutral-800/50 backdrop-blur-sm py-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <Heading level="2" className="text-3xl text-white mb-12 text-center">What students say</Heading>
                    
                    {/* Testimonial Card - Randomized on each render */}
                    {(() => {
                        const testimonials = [
                            {
                                quote: "OghmaNotes helped me organize my Canvas lectures and AI summaries cut my study time in half. I went from struggling to acing my exams.",
                                author: "Sarah Chen",
                                role: "Computer Science Student"
                            },
                            {
                                quote: "The Canvas integration is a game-changer. My notes are automatically synced, and the AI insights help me actually understand the material.",
                                author: "Marcus Johnson",
                                role: "Engineering Student"
                            },
                            {
                                quote: "Finally, a note-taking app built for students. The markdown editor is smooth, and the AI study questions keep me accountable.",
                                author: "Emma Rodriguez",
                                role: "Biology Student"
                            },
                            {
                                quote: "I love how minimal and focused OghmaNotes is. No distractions, just powerful tools for learning. Highly recommend to any student.",
                                author: "David Kim",
                                role: "Economics Student"
                            },
                            {
                                quote: "The AI-powered insights are incredible. It summarizes lectures in seconds and generates study guides automatically. Worth every penny.",
                                author: "Jessica Walsh",
                                role: "Medical Student"
                            }
                        ];
                        
                        const testimonial = testimonials[Math.floor(Math.random() * testimonials.length)];
                        
                        return (
                            <div className="p-8 rounded-lg border border-neutral-700/50 bg-neutral-900/30 backdrop-blur">
                                <div className="flex gap-1 mb-4">
                                    {[...Array(5)].map((_, i) => (
                                        <span key={i} className="text-yellow-400">★</span>
                                    ))}
                                </div>
                                <Text className="text-lg text-neutral-100 mb-6 italic">"{testimonial.quote}"</Text>
                                <div>
                                    <Text className="font-semibold text-white">{testimonial.author}</Text>
                                    <Text className="text-sm text-neutral-400">{testimonial.role}</Text>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* CTA Section */}
            <div className="border-t border-neutral-700/50 bg-neutral-800/50 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 text-center">
                    <Heading level="2" className="text-3xl text-white mb-4">Ready to transform your studying?</Heading>
                    <Text className="text-neutral-300 mb-8">Join thousands of students using OghmaNotes to study smarter.</Text>
                    <Button href="/register" color="dark/zinc" className="px-8">
                        Create Your Account
                    </Button>
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-neutral-700/50 bg-neutral-900/50 mt-auto">
                <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <Text className="text-neutral-400 text-sm">© 2025 OghmaNotes. All rights reserved.</Text>
                        <div className="flex gap-6">
                            <Link href="/privacy" className="text-neutral-400 hover:text-white text-sm transition-colors">
                                Privacy
                            </Link>
                            <Link href="/terms" className="text-neutral-400 hover:text-white text-sm transition-colors">
                                Terms
                            </Link>
                            <Link href="https://github.com" target="_blank" className="text-neutral-400 hover:text-white text-sm transition-colors">
                                GitHub
                            </Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
