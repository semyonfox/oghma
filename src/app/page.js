export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-neutral-800">
            {/* hero section */}
            <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                <div className="flex justify-center text-center">
                    <div className="max-w-4xl">
                        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
                            Welcome to <span className="text-primary-500">SocsBoard</span>
                        </h1>
                        <p className="text-xl text-neutral-300">
                            A social platform for society-student interaction
                        </p>
                    </div>
                </div>
            </div>

            {/* main content */}
            <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                <div className="flex justify-center">
                    <div className="max-w-4xl w-full">
                        <h2 className="text-3xl font-semibold text-white text-center mb-12">Get Started</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* login card */}
                            <div>
                                <div className="bg-neutral-800 border-2 border-primary-500 rounded-lg shadow-xl h-full card-hover">
                                    <div className="p-8 text-center">
                                        <h5 className="text-xl font-bold text-white mb-4">Login</h5>
                                        <p className="text-neutral-300 mb-6">
                                            Access your account and continue where you left off
                                        </p>
                                        <a href="/login" className="block w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200">
                                            Login
                                        </a>
                                    </div>
                                </div>
                            </div>

                            {/* register card */}
                            <div>
                                <div className="bg-neutral-800 border-2 border-success-500 rounded-lg shadow-xl h-full card-hover">
                                    <div className="p-8 text-center">
                                        <h5 className="text-xl font-bold text-white mb-4">Register</h5>
                                        <p className="text-neutral-300 mb-6">
                                            Create a new account and join our community
                                        </p>
                                        <a href="/register" className="block w-full bg-success-600 hover:bg-success-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200">
                                            Register
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
