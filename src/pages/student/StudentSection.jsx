import { useParams } from 'react-router-dom';
import { Bell, CalendarClock, ClipboardList, UserRound } from 'lucide-react';

const sections = {
    'health-records': {
        title: 'Personal Health',
        description: 'View your personal health information and consultation records.',
        items: [
            {
                title: 'Personal Health Information',
                description: 'Your personal health information maintained by the campus clinic.',
                emptyMessage: 'Personal health information will appear here when it is available.',
                icon: UserRound,
            },
            {
                title: 'Consultation Records',
                description: 'Notes and records from your clinic consultations.',
                emptyMessage: 'Records from completed consultations will appear here when they are available.',
                icon: ClipboardList,
            },
        ],
    },
    notifications: {
        title: 'Notifications',
        description: 'See appointment reminders and announcements from your campus clinic.',
        items: [
            {
                title: 'Appointment Reminders',
                description: 'Reminders for your upcoming clinic appointments.',
                emptyMessage: 'Appointment reminders will appear here when they are available.',
                icon: CalendarClock,
            },
            {
                title: 'Clinic Announcements',
                description: 'Updates and announcements from your campus clinic.',
                emptyMessage: 'New clinic announcements will appear here.',
                icon: Bell,
            },
        ],
    },
};

const StudentSection = () => {
    const { section } = useParams();
    const content = sections[section];

    if (!content) {
        return (
            <div className="student-section-page">
                <div className="page-heading">
                    <h1>Section not found</h1>
                    <p>This student portal section does not exist.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="student-section-page">
            <div className="page-heading">
                <h1>{content.title}</h1>
                <p>{content.description}</p>
            </div>

            <div className="student-section-grid">
                {content.items.map(item => {
                    const SectionIcon = item.icon;
                    const headingId = `student-section-${item.title.toLowerCase().replaceAll(' ', '-')}`;

                    return (
                        <section className="card student-section-card" aria-labelledby={headingId} key={item.title}>
                            <div className="section-heading">
                                <div className="stat-icon mint"><SectionIcon size={19} /></div>
                                <div>
                                    <h2 id={headingId}>{item.title}</h2>
                                    <p>{item.description}</p>
                                </div>
                            </div>
                            <div className="empty-state">
                                <p>{item.emptyMessage}</p>
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

export default StudentSection;
