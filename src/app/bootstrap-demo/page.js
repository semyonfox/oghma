import BootstrapInit from "./BootstrapInit";

export const metadata = {
  title: "Bootstrap Demo",
};

export default function BootstrapDemoPage() {
  return (
    <main className={`container py-4`}>
      <BootstrapInit />

      <h1 className="mb-4">Bootstrap Demo</h1>
      <p className="text-muted">Quick tour of common Bootstrap 5 components, utilities, and JS features.</p>

      {/* Grid system */}
      <section className="my-4">
        <h2 className="h4">Grid</h2>
        <div className="row g-3">
          <div className="col-12 col-md-4">
            <div className="p-3 border rounded bg-light">.col-12 .col-md-4</div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 border rounded bg-light">.col-12 .col-md-4</div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 border rounded bg-light">.col-12 .col-md-4</div>
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section className="my-4">
        <h2 className="h4">Buttons</h2>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary">Primary</button>
          <button className="btn btn-secondary">Secondary</button>
          <button className="btn btn-success">Success</button>
          <button className="btn btn-danger">Danger</button>
          <button className="btn btn-warning">Warning</button>
          <button className="btn btn-info">Info</button>
          <button className="btn btn-light">Light</button>
          <button className="btn btn-dark">Dark</button>
          <button className="btn btn-link">Link</button>
        </div>
      </section>

      {/* Alerts & Badges */}
      <section className="my-4">
        <h2 className="h4">Alerts & Badges</h2>
        <div className="alert alert-warning" role="alert">
          This is a warning alert—check it out! <span className="badge bg-dark ms-2">Badge</span>
        </div>
        <div className="alert alert-success" role="alert">
          A simple success alert—great job!
        </div>
      </section>

      {/* List group & Cards */}
      <section className="my-4">
        <h2 className="h4">List Group & Card</h2>
        <div className="row g-3">
          <div className="col-md-6">
            <ul className="list-group">
              <li className="list-group-item active" aria-current="true">An active item</li>
              <li className="list-group-item">A second item</li>
              <li className="list-group-item">A third item</li>
            </ul>
          </div>
          <div className="col-md-6">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Card title</h5>
                <h6 className="card-subtitle mb-2 text-body-secondary">Card subtitle</h6>
                <p className="card-text">Some quick example text to build on the card title and make up the bulk of the card&#39;s content.</p>
                <a href="#" className="card-link">Card link</a>
                <a href="#" className="card-link">Another link</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="my-4">
        <h2 className="h4">Table</h2>
        <div className="table-responsive">
          <table className="table table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>#</th>
                <th>First</th>
                <th>Last</th>
                <th>Handle</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>Mark</td>
                <td>Otto</td>
                <td>@motto</td>
              </tr>
              <tr>
                <td>2</td>
                <td>Jacob</td>
                <td>Thornton</td>
                <td>@fat</td>
              </tr>
              <tr>
                <td>3</td>
                <td colSpan={2}>Larry the Bird</td>
                <td>@twitter</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Forms */}
      <section className="my-4">
        <h2 className="h4">Forms</h2>
        <form className="row g-3">
          <div className="col-md-6">
            <label htmlFor="inputEmail4" className="form-label">Email</label>
            <input type="email" className="form-control" id="inputEmail4" placeholder="name@example.com" />
          </div>
          <div className="col-md-6">
            <label htmlFor="inputPassword4" className="form-label">Password</label>
            <input type="password" className="form-control" id="inputPassword4" />
          </div>
          <div className="col-12">
            <label htmlFor="inputAddress" className="form-label">Address</label>
            <input type="text" className="form-control" id="inputAddress" placeholder="1234 Main St" />
          </div>
          <div className="col-md-6">
            <label htmlFor="inputCity" className="form-label">City</label>
            <input type="text" className="form-control" id="inputCity" />
          </div>
          <div className="col-md-4">
            <label htmlFor="inputState" className="form-label">State</label>
            <select id="inputState" className="form-select">
              <option>Choose...</option>
              <option>...</option>
            </select>
          </div>
          <div className="col-md-2">
            <label htmlFor="inputZip" className="form-label">Zip</label>
            <input type="text" className="form-control" id="inputZip" />
          </div>
          <div className="col-12">
            <div className="form-check">
              <input className="form-check-input" type="checkbox" id="gridCheck" />
              <label className="form-check-label" htmlFor="gridCheck">
                Check me out
              </label>
            </div>
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary">Sign in</button>
          </div>
        </form>
      </section>

      {/* Collapse */}
      <section className="my-4">
        <h2 className="h4">Collapse</h2>
        <p>
          <button className="btn btn-outline-primary" type="button" data-bs-toggle="collapse" data-bs-target="#demoCollapse" aria-expanded="false" aria-controls="demoCollapse">
            Toggle content
          </button>
        </p>
        <div className="collapse" id="demoCollapse">
          <div className="card card-body">
            This collapsible content should toggle using Bootstrap JS.
          </div>
        </div>
      </section>

      {/* Modal */}
      <section className="my-4">
        <h2 className="h4">Modal</h2>
        <button type="button" className="btn btn-success" data-bs-toggle="modal" data-bs-target="#demoModal">
          Launch demo modal
        </button>

        <div className="modal fade" id="demoModal" tabIndex="-1" aria-labelledby="demoModalLabel" aria-hidden="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h1 className="modal-title fs-5" id="demoModalLabel">Modal title</h1>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div className="modal-body">
                Woohoo, you&#39;re reading this text in a modal!
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" className="btn btn-primary">Save changes</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tooltips & Popovers */}
      <section className="my-4">
        <h2 className="h4">Tooltips & Popovers</h2>
        <button type="button" className="btn btn-outline-secondary me-2" data-bs-toggle="tooltip" data-bs-placement="top" title="Tooltip on top">
          Hover for tooltip
        </button>
        <button type="button" className="btn btn-outline-secondary" data-bs-toggle="popover" data-bs-title="Popover title" data-bs-content="And here&#39;s some amazing content. It&#39;s very engaging. Right?">
          Click for popover
        </button>
      </section>

      <hr className="my-5" />
      <p className="small text-body-secondary">If something doesn&#39;t look right, check for global CSS overrides and confirm Bootstrap JS loaded (modal/collapse/tooltip should work).</p>
    </main>
  );
}
