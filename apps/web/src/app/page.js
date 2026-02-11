export default function Home() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
            <div className="max-w-6xl mx-auto px-4 py-12">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                    SocsBoard
                </h1>
                <p className="text-xl text-gray-600 mb-8">
                    University Society Platform - Connect with events and communities
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-white rounded-lg shadow">
                        <h2 className="text-2xl font-semibold mb-3">Get Started</h2>
                        <p className="text-gray-600 mb-4">
                            Join your university societies and discover events tailored to your interests.
                        </p>
                        <a href="/register" className="text-blue-600 font-medium hover:underline">
                            Create Account →
                        </a>
                    </div>
                    <div className="p-6 bg-white rounded-lg shadow">
                        <h2 className="text-2xl font-semibold mb-3">Already a Member?</h2>
                        <p className="text-gray-600 mb-4">
                            Log in to access your personalized event recommendations.
                        </p>
                        <a href="/login" className="text-blue-600 font-medium hover:underline">
                            Sign In →
                        </a>
                    </div>
                </div>
            </div>
        </main>
    )
}
