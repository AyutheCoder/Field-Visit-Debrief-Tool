import 'dotenv/config';
import { db, initSchema, getDbPath } from './index';
import { createUser } from '../repositories/users';
import { createVisit } from '../repositories/visits';
import { upsertDebrief } from '../repositories/debriefs';
import { createAction } from '../repositories/actionItems';
import { createMedia } from '../repositories/media';
import type { Blocker, FollowUp, SentimentLabel } from '../types';

async function main() {
    await initSchema();

    // Clear existing data (children first due to FK constraints).
    await db.execute('PRAGMA foreign_keys = OFF;');
    for (const t of [
        'Embedding',
        'ActionItem',
        'Debrief',
        'MediaAsset',
        'Stakeholder',
        'Pattern',
        'Visit',
        'User',
    ]) {
        await db.execute(`DELETE FROM ${t};`);
    }
    await db.execute('PRAGMA foreign_keys = ON;');

    // --- Users ---
    const officer = await createUser({
        name: 'Asha Mwangi',
        email: 'asha@fieldteam.org',
        role: 'field_officer',
    });

    const officer2 = await createUser({
        name: 'Daniel Okoro',
        email: 'daniel@fieldteam.org',
        role: 'field_officer',
    });

    await createUser({ name: 'Priya Nair', email: 'priya@fieldteam.org', role: 'manager' });
    await createUser({ name: 'Sam Carter', email: 'admin@fieldteam.org', role: 'admin' });

    const HEALTH = 'Healthcare';
    const EDU = 'Education';

    const daysAgo = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString();
    };

    interface SeedVisit {
        userId: string;
        locationName: string;
        lat: number;
        lng: number;
        programArea: string;
        visitType: string;
        daysAgo: number;
        notes: string;
        stakeholders: { name: string; role?: string; organization?: string }[];
        debrief: {
            keyFindings: string[];
            blockers: Blocker[];
            sentimentLabel: SentimentLabel;
            sentimentScore: number;
            sentimentRationale: string;
            followUps: FollowUp[];
        };
        audioTranscript?: string;
    }

    const visits: SeedVisit[] = [
        // -------------------------------------------------------------
        // NORTHERN DISTRICT - the headline story.
        // A medicine-stockout crisis: the SAME blocker recurs across three recent
        // health visits (a clear recurring pattern AND an early-warning anomaly),
        // while sentiment steadily declines as the crisis deepens.
        // -------------------------------------------------------------
        {
            userId: officer.id,
            locationName: 'Northern District - Kibo Village',
            lat: -1.94,
            lng: 36.82,
            programArea: HEALTH,
            visitType: 'Clinic assessment',
            daysAgo: 2,
            notes:
                'Visited the village health post. Staff overwhelmed; medicine shelves nearly empty. Long queues of mothers with infants waiting for malaria treatment that was unavailable.',
            stakeholders: [
                { name: 'Nurse Grace', role: 'Head Nurse', organization: 'Kibo Health Post' },
                { name: 'John Kamau', role: 'Community Leader' },
            ],
            debrief: {
                keyFindings: [
                    'Health post serving ~3x its designed patient load',
                    'Essential medicines (malaria, ORS) out of stock for two weeks',
                    'Single nurse covering the entire catchment area',
                ],
                blockers: [
                    { issue: 'Recurring medicine stockouts', category: 'supply' },
                    { issue: 'Severe staffing shortage', category: 'staffing' },
                ],
                sentimentLabel: 'negative',
                sentimentScore: -0.7,
                sentimentRationale:
                    'Community frustrated and anxious - mothers turned away without malaria tablets.',
                followUps: [
                    { action: 'Escalate emergency medicine resupply to district pharmacy', priority: 'high', owner_suggestion: 'Supply lead' },
                    { action: 'Request a second nurse posting for Kibo', priority: 'high', owner_suggestion: 'HR' },
                ],
            },
            audioTranscript:
                'The shelves are empty again. Mothers are walking three hours and we cannot give them malaria tablets. This is the third time this month. We need a resupply urgently before someone loses a child.',
        },
        {
            userId: officer.id,
            locationName: 'Northern District - Sela Town',
            lat: -1.88,
            lng: 36.9,
            programArea: HEALTH,
            visitType: 'Follow-up',
            daysAgo: 5,
            notes:
                'Pharmacy stockout persists for a second week. Cold-chain fridge broken so vaccines spoiled. Staff morale low but still committed.',
            stakeholders: [
                { name: 'Dr. Otieno', role: 'Clinical Officer', organization: 'Sela Clinic' }
            ],
            debrief: {
                keyFindings: [
                    'Stockouts of basic medicines continue from the previous visit',
                    'Vaccine cold chain compromised - refrigerator non-functional',
                ],
                blockers: [
                    { issue: 'Recurring medicine stockouts', category: 'supply' },
                    { issue: 'Broken cold-chain refrigeration', category: 'infrastructure' },
                ],
                sentimentLabel: 'negative',
                sentimentScore: -0.6,
                sentimentRationale: 'Staff committed but discouraged by repeated supply failures.',
                followUps: [
                    { action: 'Repair or replace the vaccine refrigerator', priority: 'high', owner_suggestion: 'Logistics' },
                    { action: 'Audit the Northern District medicine supply chain', priority: 'medium', owner_suggestion: 'Procurement' },
                ],
            },
        },
        {
            userId: officer2.id,
            locationName: 'Northern District - Garba Outpost',
            lat: -1.99,
            lng: 36.75,
            programArea: HEALTH,
            visitType: 'Clinic assessment',
            daysAgo: 8,
            notes:
                'Outpost also reporting empty drug shelves. Patients referred elsewhere. Same supply gap as neighbouring facilities - this is becoming district-wide.',
            stakeholders: [
                { name: 'CHW Amina', role: 'Community Health Worker', organization: 'Garba Outpost' },
            ],
            debrief: {
                keyFindings: [
                    'Drug shelves empty; patients referred to facilities hours away',
                    'Pattern of stockouts now spanning multiple Northern facilities',
                ],
                blockers: [
                    { issue: 'Recurring medicine stockouts', category: 'supply' }
                ],
                sentimentLabel: 'negative',
                sentimentScore: -0.5,
                sentimentRationale: 'Concern that the supply gap is spreading across the district.',
                followUps: [
                    { action: 'Arrange emergency stock transfer from the regional depot', priority: 'high', owner_suggestion: 'Supply lead' },
                ],
            },
        },
        {
            userId: officer.id,
            locationName: 'Northern District - Tana Outpost',
            lat: -1.85,
            lng: 37.01,
            programArea: HEALTH,
            visitType: 'Routine monitoring',
            daysAgo: 22,
            notes:
                'Earlier visit before the supply crisis escalated. Stock levels were tight but adequate. Main issue was intermittent power affecting the clinic.',
            stakeholders: [
                { name: 'Nurse Peter', role: 'Nurse', organization: 'Tana Outpost' }
            ],
            debrief: {
                keyFindings: [
                    'Medicine stocks tight but functional at the time',
                    'Frequent power outages disrupting evening services',
                ],
                blockers: [
                    { issue: 'Frequent power outages affecting the clinic', category: 'infrastructure' }
                ],
                sentimentLabel: 'negative',
                sentimentScore: -0.2,
                sentimentRationale: 'Mild concern; services still running but strained.',
                followUps: [
                    { action: 'Assess solar backup for the outpost', priority: 'medium', owner_suggestion: 'Logistics' },
                ],
            },
        },
        {
            userId: officer2.id,
            locationName: 'Northern District - Kibo Village',
            lat: -1.95,
            lng: 36.83,
            programArea: EDU,
            visitType: 'School assessment',
            daysAgo: 20,
            notes:
                'School lacks clean water; children fetch from a distant river. Sanitation poor. WASH funding request still pending.',
            stakeholders: [
                { name: 'Head Teacher Musa', role: 'Head Teacher', organization: 'Kibo Primary' }
            ],
            debrief: {
                keyFindings: [
                    'No clean water source at the school',
                    'Poor sanitation affecting attendance and health',
                ],
                blockers: [
                    { issue: 'Lack of clean water access', category: 'infrastructure' },
                    { issue: 'Pending funding for WASH facilities', category: 'funding' },
                ],
                sentimentLabel: 'negative',
                sentimentScore: -0.5,
                sentimentRationale: 'Frustration over unmet basic water and sanitation needs.',
                followUps: [
                    { action: 'Submit WASH funding proposal', priority: 'high', owner_suggestion: 'Grants team' },
                    { action: 'Explore borehole feasibility', priority: 'medium' },
                ],
            },
        },
        // -------------------------------------------------------------
        // COASTAL REGION - positive contrast; what "good" looks like.
        // -------------------------------------------------------------
        {
            userId: officer2.id,
            locationName: 'Coastal Region - Bahari Ward',
            lat: -4.05,
            lng: 39.66,
            programArea: HEALTH,
            visitType: 'Routine monitoring',
            daysAgo: 6,
            notes:
                'Well-run clinic. Community health volunteers active. Maternal attendance up. Only minor delays in lab results.',
            stakeholders: [
                { name: 'Fatuma Said', role: 'CHV Coordinator', organization: 'Bahari CHV Group' },
            ],
            debrief: {
                keyFindings: [
                    'Maternal clinic attendance increased 20% this quarter',
                    'Active community health volunteer network driving uptake',
                ],
                blockers: [
                    { issue: 'Lab result turnaround delays', category: 'infrastructure' }
                ],
                sentimentLabel: 'positive',
                sentimentScore: 0.7,
                sentimentRationale: 'Community engaged and optimistic; services seen as improving.',
                followUps: [
                    { action: 'Document the CHV model for replication in other regions', priority: 'medium', owner_suggestion: 'Program manager' },
                ],
            },
        },
        {
            userId: officer2.id,
            locationName: 'Coastal Region - Pwani School',
            lat: -4.1,
            lng: 39.7,
            programArea: EDU,
            visitType: 'School assessment',
            daysAgo: 12,
            notes:
                'New classrooms completed. Enrollment rising, especially among girls. Shortage of textbooks for upper grades. Teachers motivated.',
            stakeholders: [
                { name: 'Mr. Juma', role: 'Head Teacher', organization: 'Pwani Primary' },
                { name: 'Mary Ali', role: 'PTA Chair' },
            ],
            debrief: {
                keyFindings: [
                    'Two new classrooms operational, easing overcrowding',
                    'Enrollment up, especially among girls',
                ],
                blockers: [
                    { issue: 'Textbook shortage in upper grades', category: 'supply' }
                ],
                sentimentLabel: 'positive',
                sentimentScore: 0.6,
                sentimentRationale: 'Parents and teachers encouraged by visible infrastructure gains.',
                followUps: [
                    { action: 'Procure upper-grade textbooks', priority: 'medium', owner_suggestion: 'Procurement' },
                ],
            },
        },
        {
            userId: officer2.id,
            locationName: 'Coastal Region - Bahari Ward',
            lat: -4.05,
            lng: 39.66,
            programArea: EDU,
            visitType: 'Follow-up',
            daysAgo: 28,
            notes:
                'Scholarship program steady. A few dropouts due to family economic pressure. Mentorship highly valued by students.',
            stakeholders: [
                { name: 'Counselor Hassan', role: 'Student Counselor', organization: 'Bahari Secondary' },
            ],
            debrief: {
                keyFindings: [
                    'Scholarship retention generally strong',
                    'Economic hardship driving sporadic dropouts',
                ],
                blockers: [
                    { issue: 'Household economic pressure causing dropouts', category: 'community' }
                ],
                sentimentLabel: 'neutral',
                sentimentScore: 0.1,
                sentimentRationale: 'Mixed: program valued but external economic strain persists.',
                followUps: [
                    { action: 'Link at-risk families to livelihood support', priority: 'medium', owner_suggestion: 'Partnerships' },
                ],
            },
        },
        // -------------------------------------------------------------
        // EASTERN HIGHLANDS - neutral / improving; programme variety.
        // -------------------------------------------------------------
        {
            userId: officer.id,
            locationName: 'Eastern Highlands - Mlima Village',
            lat: -0.52,
            lng: 37.45,
            programArea: EDU,
            visitType: 'School assessment',
            daysAgo: 4,
            notes:
                'School roof damaged in recent storms. Attendance drops on rainy days. Community willing to contribute labor for repairs.',
            stakeholders: [
                { name: 'Teacher Wanjiru', role: 'Deputy Head', organization: 'Mlima Primary' }
            ],
            debrief: {
                keyFindings: [
                    'Storm-damaged roof disrupting classes',
                    'Strong community willingness to assist with repairs',
                ],
                blockers: [
                    { issue: 'Damaged school infrastructure', category: 'infrastructure' },
                    { issue: 'Weather-related absenteeism', category: 'community' },
                ],
                sentimentLabel: 'neutral',
                sentimentScore: 0.05,
                sentimentRationale: 'Concern about the roof balanced by community solidarity.',
                followUps: [
                    { action: 'Source roofing materials and mobilize community labor', priority: 'high', owner_suggestion: 'Field officer' },
                ],
            },
        },
        {
            userId: officer.id,
            locationName: 'Eastern Highlands - Nyeri Center',
            lat: -0.42,
            lng: 36.95,
            programArea: EDU,
            visitType: 'Routine monitoring',
            daysAgo: 16,
            notes:
                'Adult literacy program going well. Demand exceeds available facilitators. Participants enthusiastic.',
            stakeholders: [
                { name: 'Esther Njoki', role: 'Facilitator', organization: 'Nyeri Learning Center' },
            ],
            debrief: {
                keyFindings: [
                    'Adult literacy enrollment exceeding targets',
                    'Facilitator capacity is the main constraint to scaling',
                ],
                blockers: [
                    { issue: 'Insufficient trained facilitators', category: 'staffing' }
                ],
                sentimentLabel: 'positive',
                sentimentScore: 0.65,
                sentimentRationale: 'High enthusiasm and demand from participants.',
                followUps: [
                    { action: 'Recruit and train additional facilitators', priority: 'medium', owner_suggestion: 'Training lead' },
                ],
            },
        },
        {
            userId: officer.id,
            locationName: 'Eastern Highlands - Embu Clinic',
            lat: -0.53,
            lng: 37.46,
            programArea: HEALTH,
            visitType: 'Routine monitoring',
            daysAgo: 18,
            notes:
                'Clinic stable and well-stocked. Good immunization coverage. Occasional gaps arranging transport for emergency referrals.',
            stakeholders: [
                { name: 'Sister Mercy', role: 'Nurse-in-Charge', organization: 'Embu Clinic' }
            ],
            debrief: {
                keyFindings: [
                    'Immunization coverage above target',
                    'Stable stock levels and steady patient flow',
                ],
                blockers: [
                    { issue: 'Occasional referral transport gaps', category: 'infrastructure' }
                ],
                sentimentLabel: 'positive',
                sentimentScore: 0.5,
                sentimentRationale: 'Generally positive; only minor logistical gaps.',
                followUps: [
                    { action: 'Set a standby referral transport schedule', priority: 'low', owner_suggestion: 'Logistics' },
                ],
            },
        },
    ];

    let count = 0;
    for (const v of visits) {
        const visit = await createVisit({
            userId: v.userId,
            locationName: v.locationName,
            lat: v.lat,
            lng: v.lng,
            programArea: v.programArea,
            visitType: v.visitType,
            visitDate: daysAgo(v.daysAgo),
            rawNotesText: v.notes,
            status: 'complete',
            stakeholders: v.stakeholders,
        });

        const debrief = await upsertDebrief(visit.id, {
            ...v.debrief,
            aiModel: 'seed',
            editedByHuman: false,
        });

        for (const f of v.debrief.followUps) {
            await createAction(debrief.id, {
                description: f.action,
                priority: f.priority,
                owner: f.owner_suggestion,
            });
        }

        if (v.audioTranscript) {
            await createMedia(visit.id, {
                type: 'audio',
                url: '/uploads/sample-memo.webm',
                caption: 'Field voice memo',
                transcript: v.audioTranscript,
            });
        }

        count += 1;
    }

    console.log(`[db:seed] Seeded ${count} visits with debriefs and action items.`);
    console.log('[db:seed] 3 regions - 2 programs - recurring blocker + early-warning anomaly (Northern District medicine stockouts).');
    console.log(`[db:seed] Database: ${getDbPath()}`);
}

main().catch(console.error);