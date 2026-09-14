/**
 * 🚀 CLOUDFLARE PAGES SERVERLESS ROUTER ENGINE (functions/[[path]].js)
 * Architecture: Cloudflare Pages Functions + D1 Database + Secure AI API Proxy
 * Project: MR. Ahmed Abd-ElFatah - Unified Student Workspace Portal
 * 
 * 🗄️ D1 Database Binding: env.DB
 * 🆔 Database ID: ca82b308-d3d0-4f8e-9c41-beb54f0b0413
 * 📛 Database Name: ahmed-abdelfatah-db
 */

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 🔒 1. SECURITY & CORS HEADERS
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    const jsonResponse = (data, status = 200) => {
        return new Response(JSON.stringify(data), {
            status,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    // 🤖 2. SECURE CEREBRAS & GROQ AI PROXY ENDPOINT (/api/ai/chat)
    if (pathname === '/api/ai/chat' && request.method === 'POST') {
        try {
            const body = await request.json();
            const cerebrasKey = env.CEREBRAS_API_KEY || 'csk-94wjwe23nfwxnypf5yjhpcnfxm9fhdd92tmwm39m35nememm';

            const aiResponse = await fetch('https://api.cerebras.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cerebrasKey}`
                },
                body: JSON.stringify(body)
            });

            if (aiResponse.ok) {
                const data = await aiResponse.json();
                return jsonResponse(data, 200);
            }

            const groqKey = env.GROQ_API_KEY || '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';
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`
                },
                body: JSON.stringify({
                    model: 'openai/gpt-oss-120b',
                    messages: body.messages,
                    temperature: body.temperature || 0.7,
                    max_tokens: body.max_tokens || 800
                })
            });

            const groqData = await groqResponse.json();
            return jsonResponse(groqData, groqResponse.status);
        } catch (err) {
            return jsonResponse({ error: err.message }, 500);
        }
    }

    // 🗄️ 3. CLOUDFLARE D1 DATABASE API ENDPOINTS (/api/db/*)
    // Matches exact table names in D1: students_table, videos_table, materials_table, feed_table, portal_feedbacks
    if (pathname.startsWith('/api/db/')) {
        const d1 = env.DB;

        // --- STUDENTS TABLE ENDPOINTS ---
        if (pathname === '/api/db/students') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM students_table ORDER BY xp DESC, watch_mins DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const student = await request.json();
                    if (d1) {
                        await d1.prepare(`
                            INSERT INTO students_table (phone, name, password, grade, gender, title, xp, watch_mins, role, can_post_feed, completed_lecture_ids)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(phone) DO UPDATE SET
                                name = excluded.name,
                                password = excluded.password,
                                grade = excluded.grade,
                                gender = excluded.gender,
                                title = excluded.title,
                                xp = excluded.xp,
                                watch_mins = excluded.watch_mins,
                                role = excluded.role,
                                can_post_feed = excluded.can_post_feed,
                                completed_lecture_ids = excluded.completed_lecture_ids
                        `).bind(
                            student.phone || student.id,
                            student.name,
                            student.password || '123456',
                            student.grade || 'Grade 10 (Secandory 1)',
                            student.gender || 'Boy',
                            student.title || null,
                            student.xp || 0,
                            student.watch_mins || 0,
                            student.role || 'student',
                            student.can_post_feed ? 1 : 0,
                            JSON.stringify(student.completed_lecture_ids || [])
                        ).run();

                        // ON CONFLICT upserts don't reliably report last_row_id, so look the row up by its unique phone/id
                        const row = await d1.prepare('SELECT id FROM students_table WHERE phone = ?')
                            .bind(student.phone || student.id).first();

                        return jsonResponse({ success: true, id: row ? row.id : null, message: 'Student account provisioned in D1.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname === '/api/db/students/xp' && request.method === 'POST') {
            try {
                const { id, xpAmount } = await request.json();
                if (d1) {
                    await d1.prepare('UPDATE students_table SET xp = MAX(0, xp + ?) WHERE phone = ? OR id = ?')
                        .bind(xpAmount, id, id).run();
                    return jsonResponse({ success: true, message: `Granted ${xpAmount} EXP to student.` });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        if (pathname.startsWith('/api/db/students/') && request.method === 'DELETE') {
            const studentId = pathname.split('/').pop();
            if (d1 && studentId) {
                await d1.prepare('DELETE FROM students_table WHERE phone = ? OR id = ?').bind(studentId, studentId).run();
                return jsonResponse({ success: true, message: 'Student record removed.' });
            }
            return jsonResponse({ success: true });
        }

        // --- VIDEOS / LECTURES ENDPOINTS ---
        if (pathname === '/api/db/lectures') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM videos_table ORDER BY id ASC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const lec = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO videos_table (title, description, lesson, grade, filename, archive_url, duration_mins)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            lec.title,
                            lec.description || '',
                            lec.lesson || '1',
                            parseInt(lec.grade) || 10,
                            lec.filename || lec.archive_url || 'video.mp4',
                            lec.archive_url || lec.filename || '',
                            lec.duration_mins || 45
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Lecture registered in D1.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/lectures/') && request.method === 'DELETE') {
            const lecId = pathname.split('/').pop();
            if (d1 && lecId) {
                await d1.prepare('DELETE FROM videos_table WHERE id = ?').bind(lecId).run();
                return jsonResponse({ success: true, message: 'Lecture deleted.' });
            }
            return jsonResponse({ success: true });
        }

        // --- MATERIALS ENDPOINTS ---
        if (pathname === '/api/db/materials') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM materials_table ORDER BY id DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const mat = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO materials_table (title, type, grade, desc, filename)
                            VALUES (?, ?, ?, ?, ?)
                        `).bind(
                            mat.title,
                            mat.type || 'Worksheet',
                            parseInt(mat.grade) || 10,
                            mat.desc || mat.type || '',
                            mat.file_url || mat.filename || 'sheet.pdf'
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Study material uploaded.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/materials/') && request.method === 'DELETE') {
            const matId = pathname.split('/').pop();
            if (d1 && matId) {
                await d1.prepare('DELETE FROM materials_table WHERE id = ?').bind(matId).run();
                return jsonResponse({ success: true, message: 'Material deleted.' });
            }
            return jsonResponse({ success: true });
        }

        // --- COMMUNITY FEED ENDPOINTS ---
        if (pathname === '/api/db/feed') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM feed_table ORDER BY id DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const post = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO feed_table (author, date, text, attachment_name, image, comments_json, likes_json, xp, level_title)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            post.author,
                            post.date || 'Today',
                            post.text,
                            post.attachmentName || null,
                            post.attachmentType === 'image' ? 'uploaded.jpg' : null,
                            JSON.stringify(post.comments || []),
                            JSON.stringify(post.likedBy || []),
                            post.xp || 0,
                            post.levelTitle || 'Novice Scientist 🟢'
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Feed post broadcasted.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/feed/') && request.method === 'DELETE') {
            const feedId = pathname.split('/').pop();
            if (d1 && feedId) {
                await d1.prepare('DELETE FROM feed_table WHERE id = ?').bind(feedId).run();
                return jsonResponse({ success: true, message: 'Feed post deleted.' });
            }
            return jsonResponse({ success: true });
        }

        // --- PORTAL FEEDBACKS ENDPOINTS ---
        if (pathname === '/api/db/feedbacks') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM portal_feedbacks ORDER BY id DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const fb = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO portal_feedbacks (author, gender, id_val, rating, text, date)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).bind(
                            fb.author,
                            fb.gender || 'Boy',
                            fb.idVal || 'guest',
                            fb.rating || 0,
                            fb.text,
                            fb.date || 'Today'
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Feedback review submitted.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/feedbacks/') && request.method === 'DELETE') {
            const fbId = pathname.split('/').pop();
            if (d1 && fbId) {
                await d1.prepare('DELETE FROM portal_feedbacks WHERE id = ?').bind(fbId).run();
                return jsonResponse({ success: true, message: 'Feedback removed.' });
            }
            return jsonResponse({ success: true });
        }

        // --- RAW SQL DIRECTIVE CONSOLE ENDPOINT ---
        if (pathname === '/api/db/query' && request.method === 'POST') {
            try {
                const { sql } = await request.json();
                if (d1) {
                    const result = await d1.prepare(sql).all();
                    return jsonResponse(result);
                }
                return jsonResponse({ results: [], message: 'Simulated D1 Executor Active.' });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }
    }

    // 🌐 4. STATIC ASSET PASS-THROUGH & SPA ROUTING FALLBACK
    try {
        const response = await env.ASSETS.fetch(request);
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
            newHeaders.set(key, value);
        });

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    } catch (e) {
        return env.ASSETS.fetch(new URL('/', request.url));
    }
}
