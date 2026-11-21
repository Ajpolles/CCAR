import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  CheckCircle, 
  Stethoscope, 
  Shield, 
  Menu,
  ChevronDown,
  ChevronUp,
  FileText,
  Award
} from 'lucide-react';
import './ccars_landing_pase2.css';

// Custom Dental Icon Component
function DentalIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.5 2 6 4.5 6 7.5C6 9.5 7 11 7 13.5C7 16.5 5.5 18 5.5 20.5C5.5 21.9 6.6 22 8 22C9.8 22 10.5 20 12 20C13.5 20 14.2 22 16 22C17.4 22 18.5 21.9 18.5 20.5C18.5 18 17 16.5 17 13.5C17 11 18 9.5 18 7.5C18 4.5 15.5 2 12 2Z" />
    </svg>
  );
}

export default function CCARSLandingPage() {
  const navigate = useNavigate();
  
  // Mobile Nav State
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState(null);
  // Quick Booking Form State
  const [booking, setBooking] = useState({
    service: '',
    date: '',
    timeSlot: ''
  });
  const [bookingSubmitted, setBookingSubmitted] = useState(false);

  // Handlers
  const handleBookingSubmit = (e) => {
    e.preventDefault();
    if (!booking.service || !booking.date || !booking.timeSlot) {
      alert("Please select a service, date, and preferred time slot.");
      return;
    }
    setBookingSubmitted(true);
  };

  const resetBooking = () => {
    setBooking({ service: '', date: '', timeSlot: '' });
    setBookingSubmitted(false);
  };

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="app-wrapper">
      
      {/* 1. MAIN HEADER & NAVIGATION */}
      <header className="main-header">
        <div className="header-container">
          
          {/* Clinic Brand */}
          <a href="#" className="brand-link">
            <div className="brand-logo-box">
              <Stethoscope className="brand-icon" />
            </div>
            <div>
              <div className="brand-title">
                Campus Clinic Appointment System
              </div>
              <div className="brand-subtitle">
                Student & Staff Health Portal
              </div>
            </div>
          </a>

          {/* Nav Links */}
          <nav className="desktop-nav">
            <a href="#home" className="nav-link active">Home</a>
            <a href="#services" className="nav-link">Services</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#faq" className="nav-link">FAQ</a>
            <a href="#contact" className="nav-link">Contact</a>
          </nav>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              onClick={() => navigate('/login')}
              className="btn-staff"
            >
              <Shield className="btn-icon-sm" />
              Staff Login
            </button>
            <button
              onClick={() => navigate('/login')}
              className="btn-signin"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="btn-signin"
              style={{ backgroundColor: '#1e293b' }}
            >
              Register
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileNavOpen(!mobileNavOpen)} 
            className="mobile-menu-btn"
          >
            <Menu className="menu-icon" />
          </button>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileNavOpen && (
          <div className="mobile-nav-dropdown">
            <a href="#home" onClick={() => setMobileNavOpen(false)} className="mobile-link active">Home</a>
            <a href="#services" onClick={() => setMobileNavOpen(false)} className="mobile-link">Services</a>
            <a href="#how-it-works" onClick={() => setMobileNavOpen(false)} className="mobile-link">How It Works</a>
            <a href="#faq" onClick={() => setMobileNavOpen(false)} className="mobile-link">FAQ</a>
            <a href="#contact" onClick={() => setMobileNavOpen(false)} className="mobile-link">Contact</a>
            <div className="mobile-actions">
              <button
                onClick={() => navigate('/login')}
                className="mobile-btn-staff"
              >
                Staff Login
              </button>
              <button
                onClick={() => navigate('/login')}
                className="mobile-btn-signin"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate('/register')}
                className="mobile-btn-signin"
                style={{ backgroundColor: '#1e293b' }}
              >
                Register
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="main-content" id="home">
        
        {/* HERO & QUICK BOOKING WIDGET */}
        <section className="hero-section">
          <div className="hero-container">
            
            {/* Hero Text */}
            <div className="hero-text-area">
              <div className="hero-pill">
                <span className="pill-dot"></span>
                Official Student Health Services Portal
              </div>
              <h1 className="hero-title">
                Book your campus clinic appointment in minutes.
              </h1>
              <p className="hero-description">
                Skip long queue lines at the health center. Reserve available time slots for general medical consultations, dental checkups, and official health clearances online.
              </p>

              <div className="hero-features">
                <div className="feature-item">
                  <CheckCircle className="feature-icon" /> Licensed University Physicians
                </div>
                <div className="feature-item">
                  <CheckCircle className="feature-icon" /> Free Student Consultations
                </div>
                <div className="feature-item">
                  <CheckCircle className="feature-icon" /> Instant Digital Slots
                </div>
              </div>
            </div>

            {/* Quick Booking Widget */}
            <div className="booking-widget-card">
              <div className="widget-header">
                <h2 className="widget-title">
                  <Calendar className="widget-icon" />
                  Quick Appointment Schedule
                </h2>
                <p className="widget-sub">Pick your required service and preferred date</p>
              </div>

              {bookingSubmitted ? (
                <div className="booking-success-box">
                  <CheckCircle className="success-icon" />
                  <h3 className="success-title">Slot Selected!</h3>
                  <p className="success-text">
                    You chose <strong>{booking.service}</strong> on <strong>{booking.date}</strong> at <strong>{booking.timeSlot}</strong>.
                  </p>
                  <p className="success-subtext">Sign in to complete your booking reservation.</p>
                  <div className="success-buttons">
                    <button
                      onClick={() => navigate('/login')}
                      className="btn-confirm-slot"
                    >
                      Sign In to Confirm
                    </button>
                    <button
                      onClick={resetBooking}
                      className="btn-reset-slot"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleBookingSubmit} className="booking-form">
                  <div className="form-field">
                    <label className="field-label">
                      Type of Consultation / Service *
                    </label>
                    <select
                      value={booking.service}
                      onChange={(e) => setBooking({ ...booking, service: e.target.value })}
                      className="field-input"
                      required
                    >
                      <option value="">-- Select Service --</option>
                      <option value="General Medical Consultation">General Medical Consultation</option>
                      <option value="Dental Examination / Cleaning">Dental Examination / Cleaning</option>
                      <option value="Laboratory Request / Processing">Laboratory Request / Processing</option>
                      <option value="Medical Certificate Issuance">Medical Certificate Issuance</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="field-label">
                      Preferred Date *
                    </label>
                    <input
                      type="date"
                      value={booking.date}
                      onChange={(e) => setBooking({ ...booking, date: e.target.value })}
                      className="field-input"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="field-label">
                      Available Time Slot *
                    </label>
                    <div className="slots-grid">
                      {['09:00 AM', '10:30 AM', '01:30 PM', '02:30 PM', '03:30 PM', '04:00 PM'].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setBooking({ ...booking, timeSlot: slot })}
                          className={`slot-button ${booking.timeSlot === slot ? 'selected' : ''}`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-submit-booking"
                  >
                    Check Availability & Book Slot
                  </button>
                </form>
              )}
            </div>

          </div>
        </section>

        {/* CLINICAL SERVICES SECTION */}
        <section id="services" className="services-section">
          <div className="section-container">
            <div className="section-header">
              <h2 className="section-tag">Health & Wellness</h2>
              <p className="section-title">Available Campus Services</p>
              <p className="section-subtitle">
                Consultations are provided free for officially enrolled students and university faculty.
              </p>
            </div>

            <div className="services-grid">
              <div className="service-card">
                <div className="service-icon-bg">
                  <Stethoscope className="service-card-icon" />
                </div>
                <h3 className="service-card-title">Medical Consultation</h3>
                <p className="service-card-text">
                  Diagnosis, physical health examinations, prescriptions, and management of non-emergency conditions.
                </p>
              </div>

              <div className="service-card">
                <div className="service-icon-bg">
                  <DentalIcon className="service-card-icon" />
                </div>
                <h3 className="service-card-title">Dental Examination</h3>
                <p className="service-card-text">
                  Oral health consultations, tooth extractions, minor scaling, and toothache evaluations.
                </p>
              </div>

              <div className="service-card">
                <div className="service-icon-bg">
                  <FileText className="service-card-icon" />
                </div>
                <h3 className="service-card-title">Laboratory Requests</h3>
                <p className="service-card-text">
                  Issuance of medical laboratory requisitions, blood work screening requests, and diagnostic reviews.
                </p>
              </div>

              <div className="service-card">
                <div className="service-icon-bg">
                  <Award className="service-card-icon" />
                </div>
                <h3 className="service-card-title">Medical Clearance</h3>
                <p className="service-card-text">
                  Issuance of official health certificates for class excuses, internship (OJT) clearance, or athletics.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="how-it-works-section">
          <div className="section-container">
            <div className="section-header">
              <h2 className="section-tag">Process</h2>
              <p className="section-title">How to Book an Appointment</p>
              <p className="section-subtitle">Follow these simple steps to confirm your slot.</p>
            </div>

            <div className="steps-grid">
              <div className="step-card">
                <div className="step-number step-dark">1</div>
                <h3 className="step-title">Register Account</h3>
                <p className="step-text">
                  Sign up using your student number, university email address, section, and academic course details.
                </p>
              </div>

              <div className="step-card">
                <div className="step-number step-teal">2</div>
                <h3 className="step-title">Select Schedule</h3>
                <p className="step-text">
                  Choose the required health service, select an open date on the calendar, and pick an available time slot.
                </p>
              </div>

              <div className="step-card">
                <div className="step-number step-dark">3</div>
                <h3 className="step-title">Visit Clinic Desk</h3>
                <p className="step-text">
                  Arrive 10 minutes prior to your time slot. Present your student ID card at the reception counter.
                </p>
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
                {
                  q: "What items should I bring to my consultation?",
                  a: "Please present your physical Student ID card. Bring any past health records or prescriptions relevant to your visit, and wear a mask if you have cough or fever symptoms."
                },
                {
                  q: "Are walk-in consultations allowed?",
                  a: "Emergency medical cases are evaluated immediately. Non-emergency visits, routine dental procedures, and medical clearances require an online appointment."
                },
                {
                  q: "How can I request a Medical Certificate for missed classes?",
                  a: "Book a General Consultation within 48 hours of your illness. The attending clinic doctor will review your case and issue an official medical certificate if appropriate."
                },
                {
                  q: "What if I need to cancel or reschedule my time slot?",
                  a: "Sign into your account, navigate to 'My Schedule', and click 'Cancel' or 'Reschedule' at least 2 hours prior to your slot so others can reserve it."
                }
              ].map((faq, idx) => (
                <div key={idx} className="faq-item">
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="faq-question-btn"
                  >
                    <span>{faq.q}</span>
                    {openFaq === idx ? (
                      <ChevronUp className="faq-chevron" />
                    ) : (
                      <ChevronDown className="faq-chevron" />
                    )}
                  </button>
                  {openFaq === idx && (
                    <div className="faq-answer-box">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer id="contact" className="site-footer">
        <div className="footer-container">
          <div className="footer-grid">
            
            <div className="footer-info">
              <div className="footer-brand">
                <Stethoscope className="footer-icon" />
                <span>Campus Health Clinic</span>
              </div>
              <p className="footer-text">
                Providing outpatient primary care, preventive dental care, and health clearances for students and staff.
              </p>
            </div>

            <div>
              <h4 className="footer-heading">Clinic Location</h4>
              <p className="footer-text">
                Ground Floor, Student Services Building<br />
                Main Campus Grounds
              </p>
            </div>

            <div>
              <h4 className="footer-heading">Clinic Hours</h4>
              <p className="footer-text">
                Monday – Friday: 8:00 AM – 5:00 PM<br />
                Weekends & Holidays: Closed
              </p>
            </div>

            <div>
              <h4 className="footer-heading">Contact Desk</h4>
              <p className="footer-text">
                Direct Phone: (062) 991-2345<br />
                Campus Ext: 104 / 105
              </p>
            </div>

          </div>

          <div className="footer-bottom">
            <div>
              © {new Date().getFullYear()} Campus Clinic Appointment System. All Rights Reserved.
            </div>
            <div className="footer-links">
              <a href="#" className="footer-link">Privacy Notice</a>
              <a href="#" className="footer-link">Terms of Use</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
