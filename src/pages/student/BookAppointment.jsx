import { apiFetch } from '../../services/api';
import { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { Calendar } from 'lucide-react';
import './Dashboard.css';

export default function BookAppointment() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const waitlistPrefillApplied = useRef(false);
    
    const [formData, setFormData] = useState({
        date: '',
        time: '',
        reason: ''
    });
    
    const [feedback, setFeedback] = useState({ error: '', success: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [schedules, setSchedules] = useState([]);
    const [appointmentTypes, setAppointmentTypes] = useState([]);
    const [studentProfile, setStudentProfile] = useState(null);
    const [additionalInformation, setAdditionalInformation] = useState({});
    const [reviewing, setReviewing] = useState(false);
    const [loadingSchedules, setLoadingSchedules] = useState(Boolean(user?.token));
    const [slots, setSlots] = useState([]);
    const [loadingSlots, setLoadingSlots] = useState(false);

    const waitlistTypeId = searchParams.get('appointment_type_id');
    const waitlistDate = searchParams.get('date');
    const waitlistTime = searchParams.get('time');

    const loadSchedules = useCallback(async () => {
        const res = await apiFetch('/api/schedules', {
            headers: { Authorization: `Bearer ${user?.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load available schedules.');
        setSchedules(Array.isArray(data) ? data : []);
    }, [user?.token]);

    const loadAppointmentTypes = useCallback(async () => {
        const res = await apiFetch('/api/appointment-types', {
            headers: { Authorization: `Bearer ${user?.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load appointment types.');
        setAppointmentTypes(Array.isArray(data) ? data : []);
    }, [user?.token]);

    const loadStudentProfile = useCallback(async () => {
        const res = await apiFetch('/api/student/profile', {
            headers: { Authorization: `Bearer ${user?.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load your profile.');
        setStudentProfile(data);
    }, [user?.token]);

    useEffect(() => {
        let active = true;
        if (user?.token) {
            Promise.resolve().then(() => Promise.all([loadSchedules(), loadAppointmentTypes(), loadStudentProfile()])).catch(error => {
                if (active) setFeedback({ error: error.message || 'Could not load available schedules.', success: '' });
            }).finally(() => {
                if (active) setLoadingSchedules(false);
            });
        }
        return () => { active = false; };
    }, [loadAppointmentTypes, loadSchedules, loadStudentProfile, user?.token]);

    const selectedSchedule = schedules.find(schedule => String(schedule.id) === formData.schedule_id);
    const selectedAppointmentType = appointmentTypes.find(type => String(type.id) === formData.appointment_type_id);

    useEffect(() => {
        let active = true;
        Promise.resolve().then(() => {
            if (!active || loadingSchedules || waitlistPrefillApplied.current || !waitlistTypeId || !waitlistDate || !waitlistTime) return;
            waitlistPrefillApplied.current = true;
            const type = appointmentTypes.find(item => String(item.id) === waitlistTypeId);
            const schedule = schedules.find(item => {
                const start = String(item.start_time).slice(0, 5);
                const end = String(item.end_time).slice(0, 5);
                const minutes = Number(type?.duration_minutes) || 0;
                const [hour, minute] = waitlistTime.split(':').map(Number);
                const offered = hour * 60 + minute;
                const [startHour, startMinute] = start.split(':').map(Number);
                const [endHour, endMinute] = end.split(':').map(Number);
                const startMinutes = startHour * 60 + startMinute;
                const endMinutes = endHour * 60 + endMinute;
                return String(item.available_date).slice(0, 10) === waitlistDate && type
                    && offered >= startMinutes && offered + minutes <= endMinutes;
            });
            if (!type || !schedule) {
                setFeedback({ error: 'The offered time is no longer listed in an available schedule. Choose a current schedule and time.', success: '' });
                return;
            }
            setAdditionalInformation(Object.fromEntries((type.required_information || []).map(field => [field, ''])));
            setFormData(current => ({ ...current, appointment_type_id: String(type.id), schedule_id: String(schedule.id), date: waitlistDate, time: '' }));
        });
        return () => { active = false; };
    }, [appointmentTypes, loadingSchedules, schedules, waitlistDate, waitlistTime, waitlistTypeId]);

    useEffect(() => {
        let active = true;
        if (user?.token && selectedSchedule && selectedAppointmentType) {
            Promise.resolve().then(async () => {
                setLoadingSlots(true);
                const params = new URLSearchParams({
                    date: formData.date,
                    schedule_id: formData.schedule_id,
                    appointment_type_id: formData.appointment_type_id
                });
                const response = await apiFetch(`/api/available-slots?${params}`, {
                    headers: { Authorization: `Bearer ${user.token}` }
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Could not load available time slots.');
                if (active) setSlots(Array.isArray(data) ? data : []);
            }).catch(error => {
                if (active) setFeedback({ error: error.message || 'Could not load available time slots.', success: '' });
            }).finally(() => {
                if (active) setLoadingSlots(false);
            });
        }
        return () => { active = false; };
    }, [formData.appointment_type_id, formData.date, formData.schedule_id, selectedAppointmentType, selectedSchedule, user?.token]);

    useEffect(() => {
        let active = true;
        Promise.resolve().then(() => {
            if (!active || !waitlistPrefillApplied.current || loadingSlots || !slots.length || !waitlistTime || formData.time) return;
            if (slots.some(slot => String(slot.time).slice(0, 5) === waitlistTime.slice(0, 5))) {
                setFormData(current => ({ ...current, time: waitlistTime.slice(0, 5) }));
                setSearchParams({}, { replace: true });
            } else if (selectedSchedule && selectedAppointmentType) {
                setFeedback({ error: 'The offered time has already been taken. Other available times are shown below.', success: '' });
                setSearchParams({}, { replace: true });
            }
        });
        return () => { active = false; };
    }, [formData.time, loadingSlots, selectedAppointmentType, selectedSchedule, setSearchParams, slots, waitlistTime]);

    const timeValue = value => String(value || '').slice(0, 5);

    const handleChange = (e) => {
        setReviewing(false);
        if (e.target.name === 'appointment_type_id') {
            setSlots([]);
            const type = appointmentTypes.find(item => String(item.id) === e.target.value);
            setAdditionalInformation(Object.fromEntries((type?.required_information || []).map(field => [field, ''])));
            setFormData({ ...formData, appointment_type_id: e.target.value, time: '' });
            return;
        }
        if (e.target.name === 'schedule_id') {
            const schedule = schedules.find(item => String(item.id) === e.target.value);
            setSlots([]);
            setFormData({ ...formData, schedule_id: e.target.value, date: schedule ? String(schedule.available_date).slice(0, 10) : '', time: '' });
            return;
        }
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFeedback({ error: '', success: '' });
        if (!reviewing) {
            setReviewing(true);
            return;
        }
        setIsSubmitting(true);

        try {
            if (!selectedAppointmentType) throw new Error('Choose an active appointment type.');
            if (!selectedSchedule) throw new Error('Choose an available clinic schedule.');
            const res = await apiFetch('/api/appointments', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ ...formData, additional_information: additionalInformation })
            });
            
            const data = await res.json();
            
            if (!res.ok && data.error === 'Selected schedule is unavailable for that date or time') {
                try {
                    await loadSchedules();
                } catch {
                    setSchedules([]);
                }
                setFormData(current => ({ ...current, schedule_id: '', date: '', time: '' }));
                throw new Error('That schedule has changed or is no longer available. The schedule list is refreshed; please choose a schedule again.');
            }
            if (!res.ok) throw new Error(data.error || 'Failed to book appointment');
            
            setFeedback({ success: 'Appointment booked successfully! Redirecting...', error: '' });
            
            setTimeout(() => {
                navigate('/student/dashboard');
            }, 2000);
            
        } catch (err) {
            setFeedback({ error: err.message, success: '' });
            setIsSubmitting(false);
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Book a Clinic Appointment</h1>
                <p>Select your preferred date and time for a consultation.</p>
            </div>

            <div className="section-card form-card">
                <div className="section-header" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
                    <h3><Calendar size={18} className="text-green"/> Appointment Form</h3>
                </div>
                
                {feedback.error && <div className="alert alert-error">{feedback.error}</div>}
                {feedback.success && <div className="alert alert-success">{feedback.success}</div>}
                
                <form onSubmit={handleSubmit} className="appointment-form">
                    <section className="section-card" aria-labelledby="student-booking-profile">
                        <h3 id="student-booking-profile">Your profile</h3>
                        <p>{studentProfile ? `${studentProfile.name} · ${studentProfile.student_number || 'Student number unavailable'}` : 'Loading your profile…'}</p>
                        {studentProfile && <p>{[studentProfile.course, studentProfile.year_level, studentProfile.section].filter(Boolean).join(' · ')}</p>}
                    </section>

                    <div className="form-group">
                        <label htmlFor="appointment_type_id">Appointment type</label>
                        <select id="appointment_type_id" name="appointment_type_id" value={formData.appointment_type_id || ''} onChange={handleChange} required disabled={loadingSchedules || appointmentTypes.length === 0}>
                            <option value="">{loadingSchedules ? 'Loading appointment types...' : 'Choose an appointment type'}</option>
                            {appointmentTypes.map(type => <option key={type.id} value={type.id}>{type.name} ({type.duration_minutes} min){type.requires_approval ? ' · Staff approval required' : ''}</option>)}
                        </select>
                        {!loadingSchedules && appointmentTypes.length === 0 && <p role="status">The clinic has not configured any bookable appointment types yet.</p>}
                        {selectedAppointmentType?.description && <p>{selectedAppointmentType.description}</p>}
                    </div>

                    {(selectedAppointmentType?.required_information || []).map(field => <div className="form-group" key={field}>
                        <label htmlFor={`required-${field}`}>{field.replace(/[_-]/g, ' ')}</label>
                        <input id={`required-${field}`} value={additionalInformation[field] || ''} onChange={event => setAdditionalInformation({ ...additionalInformation, [field]: event.target.value })} onFocus={() => setReviewing(false)} required maxLength={1000} />
                    </div>)}

                    <div className="form-group">
                        <label htmlFor="schedule_id">Available clinic schedule</label>
                        <select id="schedule_id" name="schedule_id" value={formData.schedule_id || ''} onChange={handleChange} required disabled={loadingSchedules || schedules.length === 0}>
                            <option value="">{loadingSchedules ? 'Loading schedules...' : 'Choose a schedule'}</option>
                            {schedules.map(schedule => <option key={schedule.id} value={schedule.id}>
                                {String(schedule.available_date).slice(0, 10)} · {schedule.admin_first_name} {schedule.admin_last_name} · {timeValue(schedule.start_time)}–{timeValue(schedule.end_time)}
                            </option>)}
                        </select>
                        {!loadingSchedules && schedules.length === 0 && <p role="status">There are no available schedules right now.</p>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="date">Date</label>
                        <input 
                            type="date" 
                            id="date" 
                            name="date" 
                            value={formData.date} 
                            readOnly
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="time">Time</label>
                        <select id="time" name="time" value={formData.time} onChange={handleChange} required disabled={!selectedSchedule || !selectedAppointmentType || loadingSlots || slots.length === 0}>
                            <option value="">{loadingSlots ? 'Loading time slots...' : 'Choose an available time'}</option>
                            {slots.map(slot => <option key={`${slot.schedule_id}-${slot.time}`} value={slot.time}>{timeValue(slot.time)}{slot.remaining_capacity < selectedAppointmentType.capacity_per_slot ? ` (${slot.remaining_capacity} spaces left)` : ''}</option>)}
                        </select>
                        {!loadingSlots && selectedSchedule && selectedAppointmentType && slots.length === 0 && <p role="status">There are no open slots for this appointment type and schedule.</p>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="reason">Reason for Visit / Symptoms</label>
                        <textarea 
                            id="reason" 
                            name="reason" 
                            rows="4"
                            placeholder="Please briefly describe why you need an appointment..."
                            value={formData.reason} 
                            onChange={handleChange} 
                            required 
                        />
                    </div>

                    {reviewing && <section className="section-card" aria-labelledby="booking-review-title">
                        <h3 id="booking-review-title">Review your appointment</h3>
                        <p>{studentProfile?.name} · {selectedAppointmentType?.name}</p>
                        <p>{formData.date} at {formData.time} with {selectedSchedule?.admin_first_name} {selectedSchedule?.admin_last_name}</p>
                        <p>Reason: {formData.reason}</p>
                        {(selectedAppointmentType?.required_information || []).map(field => <p key={field}>{field.replace(/[_-]/g, ' ')}: {additionalInformation[field]}</p>)}
                        <button type="button" onClick={() => setReviewing(false)}>Edit details</button>
                    </section>}

                    <button type="submit" className="submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Booking...' : reviewing ? 'Confirm Appointment' : 'Review appointment'}
                    </button>
                </form>
            </div>
        </div>
    );
}
