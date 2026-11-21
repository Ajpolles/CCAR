import { apiFetch } from '../../services/api';
import { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext'; // Adjust path if needed
import { 
  Calendar, CheckCircle, Stethoscope, Shield, Menu,
  ChevronDown, ChevronUp, FileText, Award, X, Mail, Lock, AlertCircle
} from 'lucide-react';
import './LandingPage.css';

// Custom Dental Icon Component
function DentalIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.5 2 6 4.5 6 7.5C6 9.5 7 11 7 13.5C7 16.5 5.5 18 5.5 20.5C5.5 21.9 6.6 22 8 22C9.8 22 10.5 20 12 20C13.5 20 14.2 22 16 22C17.4 22 18.5 21.9 18.5 20.5C18.5 18 17 16.5 17 13.5C17 11 18 9.5 18 7.5C18 4.5 15.5 2 12 2Z" />
    </svg>
  );
}

export default function CCARSLandingPage() {
  const { login } = useContext(AuthContext);
  
  // UI States
  const [activeModal, setActiveModal] = useState(null); // 'student-login', 'student-register', 'staff-login'
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  
  // API Request States
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ------------------- LOGIN LOGIC -------------------
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      // Use AuthContext to log the user in
      login(data);
      setActiveModal(null); // Close modal on success
    } catch (err) {
      setError(err.message);
    }
  };

  // ------------------- REGISTER LOGIC -------------------
  const [regData, setRegData] = useState({
    student_number: '', first_name: '', last_name: '', 
    email: '', password: '', confirmPassword: '', 
    course: '', year_level: '1st Year', section: '', contact_number: ''
  });

  const handleRegChange = (e) => setRegData({ ...regData, [e.target.name]: e.target.value });

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (regData.password !== regData.confirmPassword) {
      return setError('Passwords do not match');
    }

    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      // Clear form and switch to login
      setSuccessMsg('Registration successful! Please log in.');
      setActiveModal('student-login');
    } catch (err) {
      setError(err.message);
    }
  };

  // ------------------- HELPER LOGIC -------------------
  const openModal = (type) => {
    setError('');
    setSuccessMsg('');
    setActiveModal(type);
    setMobileNavOpen(false);
  };

  const toggleFaq = (index) => setOpenFaq(openFaq === index ? null : index);

  return (
    <div className="app-wrapper">
      
      {/* 1. MAIN HEADER & NAVIGATION */}
      <header className="main-header">
        <div className="header-container">
          <a href="#" className="brand-link">
            <div className="brand-logo-box">
              <Stethoscope className="brand-icon" />
            </div>
            <div>
              <div className="brand-title">CCARS</div>
              <div className="brand-subtitle">Campus Clinic Appointments and Records</div>
            </div>
          </a>

          <nav className="desktop-nav">
            <a href="#home" className="nav-link active">Home</a>
            <a href="#services" className="nav-link">Services</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#faq" className="nav-link">FAQ</a>
          </nav>

          <div className="action-buttons">
      
            <button onClick={() => openModal('student-login')} className="btn-signin">
              Sign In
            </button>
            <button onClick={() => openModal('student-register')} className="btn-signin" style={{ backgroundColor: '#1e293b' }}>
              Register
            </button>
          </div>

          <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="mobile-menu-btn">
            <Menu className="menu-icon" />
          </button>
        </div>
      </header>

      {/* Main Content (Hero, Services, etc.) */}
      <main className="main-content" id="home">
        {/* HERO SECTION */}
        <section className="hero-section">
          <div className="hero-container">
            <div className="hero-text-area">
              <div className="hero-pill">
                <span className="pill-dot"></span>
                Official Student Health Services Portal
              </div>
              <h1 className="hero-title">Book your campus clinic appointment in minutes.</h1>
              <p className="hero-description">
                Skip long queue lines at the health center. Reserve available time slots for general medical consultations, dental checkups, and official health clearances online.
              </p>
              <div className="hero-features">
                <div className="feature-item"><CheckCircle className="feature-icon" /> Licensed Physicians</div>
                <div className="feature-item"><CheckCircle className="feature-icon" /> Free Consultations</div>
                <div className="feature-item"><CheckCircle className="feature-icon" /> Instant Digital Slots</div>
              </div>
            </div>

            <div className="booking-widget-card">
              <div className="widget-header">
                <h2 className="widget-title"><Calendar className="widget-icon" /> Quick Appointment Check</h2>
                <p className="widget-sub">Sign in to view real-time availability</p>
              </div>
              <div className="booking-success-box" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
                <Stethoscope className="success-icon" style={{ color: '#475569' }} />
                <h3 className="success-title">Secure Portal</h3>
                <p className="success-text">You must have an active student or staff account to book an appointment or view medical records.</p>
                <div className="success-buttons">
                  <button onClick={() => openModal('student-login')} className="btn-confirm-slot">Sign In to Book</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CLINICAL SERVICES */}
        <section id="services" className="services-section">
          <div className="section-container">
            <div className="section-header">
              <h2 className="section-tag">Health & Wellness</h2>
              <p className="section-title">Available Campus Services</p>
            </div>
            <div className="services-grid">
              <div className="service-card">
                <div className="service-icon-bg"><Stethoscope className="service-card-icon" /></div>
                <h3 className="service-card-title">Medical Consultation</h3>
                <p className="service-card-text">Diagnosis, physical examinations, and prescriptions.</p>
              </div>
              <div className="service-card">
                <div className="service-icon-bg"><DentalIcon className="service-card-icon" /></div>
                <h3 className="service-card-title">Dental Examination</h3>
                <p className="service-card-text">Oral health consultations and tooth extractions.</p>
              </div>
              <div className="service-card">
                <div className="service-icon-bg"><FileText className="service-card-icon" /></div>
                <h3 className="service-card-title">Laboratory Requests</h3>
                <p className="service-card-text">Issuance of medical laboratory requisitions.</p>
              </div>
              <div className="service-card">
                <div className="service-icon-bg"><Award className="service-card-icon" /></div>
                <h3 className="service-card-title">Medical Clearance</h3>
                <p className="service-card-text">Health certificates for class excuses or OJT.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section id="faq" className="faq-section">
          <div className="faq-container">
            <div className="section-header">
              <h2 className="section-tag">Information</h2>
              <p className="section-title">Frequently Asked Questions</p>
            </div>
            <div className="faq-list">
              {[
                { q: "What items should I bring to my consultation?", a: "Please present your physical Student ID card." },
                { q: "Are walk-in consultations allowed?", a: "Emergency medical cases only. Routine visits require an online appointment." },
              ].map((faq, idx) => (
                <div key={idx} className="faq-item">
                  <button onClick={() => toggleFaq(idx)} className="faq-question-btn">
                    <span>{faq.q}</span>
                    {openFaq === idx ? <ChevronUp className="faq-chevron" /> : <ChevronDown className="faq-chevron" />}
                  </button>
                  {openFaq === idx && <div className="faq-answer-box">{faq.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>


      {/* ================= MODALS ================= */}

      {/* 1. STUDENT SIGN IN MODAL */}
      {activeModal === 'student-login' && (
        <div className="modal-overlay">
          <div className="modal-card modal-sm">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Student Sign In</h3>
                <p className="modal-subtitle">Enter your login details to proceed</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="modal-close-btn"><X className="close-icon" /></button>
            </div>

            <form onSubmit={handleLoginSubmit} className="modal-form">
              {successMsg && <div style={{ color: '#0f766e', fontSize: '0.75rem', padding: '0.5rem', backgroundColor: '#ccfbf1', borderRadius: '4px', textAlign: 'center' }}>{successMsg}</div>}
              {error && <div style={{ color: '#b91c1c', fontSize: '0.75rem', padding: '0.5rem', backgroundColor: '#fef2f2', borderRadius: '4px', textAlign: 'center' }}>{error}</div>}

              <div className="form-field">
                <label className="field-label">Email Address</label>
                <div className="input-icon-wrapper">
                  <Mail className="input-icon" />
                  <input
                    type="email"
                    required
                    placeholder="student@university.edu"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="field-input input-with-icon"
                  />
                </div>
              </div>

              <div className="form-field">
                <label className="field-label">Password</label>
                <div className="input-icon-wrapper">
                  <Lock className="input-icon" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="field-input input-with-icon"
                  />
                </div>
              </div>

              <button type="submit" className="btn-modal-primary">Sign In</button>

              <div className="modal-footer-switch">
                Don't have an account yet?{" "}
                <button type="button" onClick={() => openModal('student-register')} className="switch-btn">Register Here</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* 2. STUDENT REGISTRATION MODAL */}
      {activeModal === 'student-register' && (
        <div className="modal-overlay">
          <div className="modal-card modal-lg">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Student Account Registration</h3>
                <p className="modal-subtitle">Fill out your academic and personal information</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="modal-close-btn"><X className="close-icon" /></button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="modal-form">
              {error && <div style={{ color: '#b91c1c', fontSize: '0.75rem', padding: '0.5rem', backgroundColor: '#fef2f2', borderRadius: '4px', textAlign: 'center' }}>{error}</div>}
              
              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">Student Number *</label>
                  <input type="text" name="student_number" required placeholder="2024-01234" value={regData.student_number} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">Email Address *</label>
                  <input type="email" name="email" required placeholder="student@university.edu" value={regData.email} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">First Name *</label>
                  <input type="text" name="first_name" required placeholder="Juan" value={regData.first_name} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">Last Name *</label>
                  <input type="text" name="last_name" required placeholder="Dela Cruz" value={regData.last_name} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">Course / Degree *</label>
                  <input type="text" name="course" required placeholder="BS Computer Science" value={regData.course} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">Year Level *</label>
                  <select name="year_level" required value={regData.year_level} onChange={handleRegChange} className="field-input">
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="field-label">Section *</label>
                  <input type="text" name="section" required placeholder="Section A" value={regData.section} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">Contact Number *</label>
                  <input type="tel" name="contact_number" required placeholder="0917 123 4567" value={regData.contact_number} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">Password *</label>
                  <input type="password" name="password" required placeholder="Minimum 8 characters" value={regData.password} onChange={handleRegChange} className="field-input" />
                </div>
                <div className="form-field">
                  <label className="field-label">Confirm Password *</label>
                  <input type="password" name="confirmPassword" required placeholder="Re-enter password" value={regData.confirmPassword} onChange={handleRegChange} className="field-input" />
                </div>
              </div>

              <div className="form-submit-container">
                <button type="submit" className="btn-modal-primary">Register Account</button>
              </div>

              <div className="modal-footer-switch">
                Already registered?{" "}
                <button type="button" onClick={() => openModal('student-login')} className="switch-btn">Sign In Here</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. STAFF LOGIN MODAL (Placeholder UI) */}
      {activeModal === 'staff-login' && (
        <div className="modal-overlay">
          <div className="modal-card modal-sm">
            <div className="modal-header">
              <div className="modal-title-with-badge">
                <Shield className="staff-badge-icon" />
                <div>
                  <h3 className="modal-title">Clinic Personnel</h3>
                  <p className="modal-subtitle">Staff portal authentication</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="modal-close-btn"><X className="close-icon" /></button>
            </div>
            <form className="modal-form">
               <div className="staff-warning-box">
                <AlertCircle className="warning-icon" />
                <span>Under construction. Admin endpoints needed.</span>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
