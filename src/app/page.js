export default function Home() {
  return (
    <div className="min-vh-100 bg-dark bg-gradient">
      {/* Hero Section */}
        <div className="container py-5">
          <div className="row justify-content-center text-center">
            <div className="col-lg-8">
              <h1 className="display-3 text-light fw-bold mb-4">
                Welcome to <span className="text-primary">SocsBoard</span>
              </h1>
              <p className="lead text-light-emphasis">
                A social platform for society-student interaction
              </p>
            </div>
          </div>
        </div>

      {/* Main Content */}
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <h2 className="text-light text-center mb-5">Get Started</h2>

            <div className="row g-4">
              {/* login Card */}
              <div className="col-md-6">
                <div className="card bg-dark border-primary shadow-lg h-100">
                  <div className="card-body text-center p-4">
                    <h5 className="text-light fw-bold mb-3">Login</h5>
                    <p className="text-light-emphasis mb-4">
                      Access your account and continue where you left off
                    </p>
                    <a href="/login" className="btn btn-primary w-100">
                      Login
                    </a>
                  </div>
                </div>
              </div>

              {/* register Card */}
              <div className="col-md-6">
                <div className="card bg-dark border-success shadow-lg h-100">
                  <div className="card-body text-center p-4">
                    <h5 className="text-light fw-bold mb-3">Register</h5>
                    <p className="text-light-emphasis mb-4">
                      Create a new account and join our community
                    </p>
                    <a href="/register" className="btn btn-success w-100">
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

