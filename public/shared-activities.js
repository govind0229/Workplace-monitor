// ─── Shared Wellbeing Activities Configuration ───

const wellbeingActivities = [
    {
        id: 'lunch', title: 'Lunch Break', desc: 'Step away for a proper meal break.', color: '#10b981',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>'
    },
    {
        id: 'water', title: 'Drink Water', desc: 'Stay hydrated throughout the day.', color: '#3b82f6',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>'
    },
    {
        id: 'stretch_walk', title: 'Stand & Stretch', desc: 'Relieve tension with a quick stretch.', color: '#7c3aed',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'
    },
    {
        id: 'breathe', title: 'Breathe Deep', desc: 'Calm your mind with breathing.', color: '#ef4444',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>'
    },
    {
        id: 'walk', title: 'Go For a Walk', desc: 'Get some fresh air and movement.', color: '#d97706',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>'
    },
    {
        id: 'focus', title: 'Focus Session', desc: 'Deep work with no distractions.', color: '#0891b2',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    },
    {
        id: 'mindful', title: 'Mindful Minute', desc: 'A moment of calm awareness.', color: '#16a34a',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>'
    },
    {
        id: 'read', title: 'Read & Learn', desc: 'Invest in personal growth.', color: '#ca8a04',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
    },
    {
        id: 'coffee', title: 'Coffee / Snack', desc: 'Short break.', color: '#8b5a2b',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>'
    },
    {
        id: 'driving', title: 'Driving', desc: 'In transit.', color: '#f59e0b',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a2 2 0 0 0-1.6-.8H9.3a2 2 0 0 0-1.6.8L5 11l-5.16.86a1 1 0 0 0-.84.99V16h3m10 0a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0m-8 0a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0"/></svg>'
    },
    {
        id: 'exercise', title: 'Exercise', desc: 'Physical activity.', color: '#10b981',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 11-5.5-5.5a2 2 0 0 0-2.8 0l-5.2 5.2a2 2 0 0 0 0 2.8l5.5 5.5a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8Z"/><path d="m14 15 2 2"/><path d="m10 11-2-2"/></svg>'
    },
    {
        id: 'personal', title: 'Personal', desc: 'Off work.', color: '#ef4444',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a2 2 0 0 1 3.42 0l6.51 11.239a2 2 0 0 1-1.71 3H5.046a2 2 0 0 1-1.71-3L9.846 5.076Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    }
];
