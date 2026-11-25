const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const cors = require('cors');
const path = require('path');
require('dotenv').config();
const db = require('./db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple Admin Auth Middleware
const requireAdmin = (req, res, next) => {
    const adminPass = req.headers['x-admin-password'];
    if (adminPass !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized admin access' });
    }
    next();
};

// 1. Fetch Questions for the Quiz (Strips out correct_option_index)
app.get('/api/questions', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, category, question_text, image_url, options FROM questions ORDER BY id ASC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load questions' });
    }
});

// 2. Submit Test & Calculate Score Server-Side
app.post('/api/tests/submit', async (req, res) => {
    const { email, fullName, answers } = req.body; // answers: [{ questionId: 1, selectedIndex: 2 }]

    try {
        // Upsert user
        const userResult = await db.query(
            `INSERT INTO users (email, full_name) 
             VALUES ($1, $2) 
             ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name 
             RETURNING id`,
            [email, fullName]
        );
        const userId = userResult.rows[0].id;

        // Fetch correct answers
        const questionsResult = await db.query('SELECT id, category, correct_option_index FROM questions');
        const questionMap = new Map(questionsResult.rows.map(q => [q.id, q]));

        let rawScore = 0;
        const breakdown = { logic: 0, patterns: 0, memory: 0, reasoning: 0 };

        answers.forEach(ans => {
            const question = questionMap.get(ans.questionId);
            if (question && question.correct_option_index === ans.selectedIndex) {
                rawScore += 1;
                breakdown[question.category] = (breakdown[question.category] || 0) + 1;
            }
        });

        // Basic IQ normalization formula (customize based on your question count)
        const totalQuestions = questionsResult.rows.length || 1;
        const iqScore = Math.round(70 + (rawScore / totalQuestions) * 75);

        // Save attempt (locked by default)
        const attemptResult = await db.query(
            `INSERT INTO test_attempts (user_id, raw_score, iq_score, category_breakdown, is_unlocked)
             VALUES ($1, $2, $3, $4, FALSE) RETURNING id`,
            [userId, rawScore, iqScore, JSON.stringify(breakdown)]
        );

        res.json({
            attemptId: attemptResult.rows[0].id,
            message: 'Test graded. Unlock full report to view IQ score and breakdown.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit test' });
    }
});

// 3. Admin Route: Add a New Question
app.post('/api/admin/questions', requireAdmin, async (req, res) => {
    const { category, question_text, image_url, options, correct_option_index } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO questions (category, question_text, image_url, options, correct_option_index)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [category, question_text, image_url || null, JSON.stringify(options), correct_option_index]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to add question' });
    }
});

// 4. Admin Route: Update Report Price
app.put('/api/admin/settings/price', requireAdmin, async (req, res) => {
    const { price_naira } = req.body;
    const priceKobo = Math.round(price_naira * 100);
    try {
        await db.query(
            `UPDATE app_settings SET setting_value = $1 WHERE setting_key = 'report_price_kobo'`,
            [priceKobo.toString()]
        );
        res.json({ message: 'Price updated', price_kobo: priceKobo });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update price' });
    }
});

// 5. Initialize Paystack Checkout
app.post('/api/payments/initialize', async (req, res) => {
    const { attemptId } = req.body;

    try {
        // Get attempt and user email
        const attemptRes = await db.query(
            `SELECT ta.id, ta.is_unlocked, u.email 
             FROM test_attempts ta 
             JOIN users u ON ta.user_id = u.id 
             WHERE ta.id = $1`,
            [attemptId]
        );

        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ error: 'Test attempt not found' });
        }

        const attempt = attemptRes.rows[0];
        if (attempt.is_unlocked) {
            return res.status(400).json({ error: 'Report is already unlocked' });
        }

        // Get dynamic price from settings
        const priceRes = await db.query(
            `SELECT setting_value FROM app_settings WHERE setting_key = 'report_price_kobo'`
        );
        const amountKobo = parseInt(priceRes.rows[0].setting_value, 10);

        // Generate unique reference
        const reference = `IQ_${attemptId}_${Date.now()}`;

        // Save pending payment record
        await db.query(
            `INSERT INTO payments (test_attempt_id, reference, amount_kobo, status)
             VALUES ($1, $2, $3, 'pending')`,
            [attemptId, reference, amountKobo]
        );

        // Call Paystack Initialize API
        const paystackRes = await axios.post(
            'https://paystack.co',
            {
                email: attempt.email,
                amount: amountKobo,
                reference: reference,
                callback_url: `${process.env.BASE_URL}/results.html?attemptId=${attemptId}&reference=${reference}`,
                metadata: { attempt_id: attemptId }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            authorization_url: paystackRes.data.data.authorization_url,
            reference: reference
        });
    } catch (err) {
        console.error('Paystack Init Error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Could not initialize payment' });
    }
});

// 6. Verify Paystack Payment (Called when user returns to results page)
app.get('/api/payments/verify/:reference', async (req, res) => {
    const { reference } = req.params;

    try {
        const paystackRes = await axios.get(
            `https://paystack.co{reference}`,
            {
                headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
            }
        );

        const data = paystackRes.data.data;

        if (data.status === 'success') {
            // Update payment record
            const paymentRes = await db.query(
                `UPDATE payments 
                 SET status = 'success', paid_at = CURRENT_TIMESTAMP 
                 WHERE reference = $1 RETURNING test_attempt_id`,
                [reference]
            );

            if (paymentRes.rows.length > 0) {
                const attemptId = paymentRes.rows[0].test_attempt_id;
                await db.query(
                    `UPDATE test_attempts SET is_unlocked = TRUE WHERE id = $1`,
                    [attemptId]
                );
            }

            return res.json({ status: 'success', message: 'Report unlocked' });
        }

        res.status(400).json({ status: data.status, message: 'Payment not successful' });
    } catch (err) {
        console.error('Verify Error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Payment verification failed' });
    }
});

// 7. Paystack Webhook (Backup unlock if browser closes before redirect)
app.post('/api/payments/webhook', async (req, res) => {
    const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
        return res.sendStatus(401);
    }

    const event = req.body;
    if (event.event === 'charge.success') {
        const reference = event.data.reference;
        try {
            const paymentRes = await db.query(
                `UPDATE payments 
                 SET status = 'success', paid_at = CURRENT_TIMESTAMP 
                 WHERE reference = $1 RETURNING test_attempt_id`,
                [reference]
            );

            if (paymentRes.rows.length > 0) {
                await db.query(
                    `UPDATE test_attempts SET is_unlocked = TRUE WHERE id = $1`,
                    [paymentRes.rows[0].test_attempt_id]
                );
            }
        } catch (err) {
            console.error('Webhook DB Error:', err);
        }
    }

    res.sendStatus(200);
});

// 8. Fetch Test Results (Locked Preview vs. Unlocked Full Report)
app.get('/api/results/:attemptId', async (req, res) => {
    const { attemptId } = req.params;

    try {
        const result = await db.query(
            `SELECT ta.id, ta.raw_score, ta.iq_score, ta.category_breakdown, 
                    ta.is_unlocked, ta.completed_at, u.full_name, u.email
             FROM test_attempts ta
             JOIN users u ON ta.user_id = u.id
             WHERE ta.id = $1`,
            [attemptId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Results not found' });
        }

        const record = result.rows[0];

        // Fetch current unlock price for the paywall button
        const priceRes = await db.query(
            `SELECT setting_value FROM app_settings WHERE setting_key = 'report_price_kobo'`
        );
        const priceNaira = parseInt(priceRes.rows[0].setting_value, 10) / 100;

        // If locked, hide sensitive scores
        if (!record.is_unlocked) {
            return res.json({
                attemptId: record.id,
                fullName: record.full_name,
                isUnlocked: false,
                priceNaira: priceNaira,
                previewMessage: 'Your cognitive profile is ready. Unlock to view your exact IQ score and category analysis.'
            });
        }

        // If unlocked, return full report
        res.json({
            attemptId: record.id,
            fullName: record.full_name,
            isUnlocked: true,
            iqScore: record.iq_score,
            rawScore: record.raw_score,
            categoryBreakdown: record.category_breakdown,
            completedAt: record.completed_at
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load results' });
    }
});
// 9. Admin Route: Dashboard Overview (Users, Tests, Payments)
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
    try {
        const users = await db.query('SELECT * FROM users ORDER BY created_at DESC');
        const tests = await db.query(
            `SELECT ta.*, u.email, u.full_name 
             FROM test_attempts ta 
             JOIN users u ON ta.user_id = u.id 
             ORDER BY ta.completed_at DESC`
        );
        const payments = await db.query(
            `SELECT p.*, u.email 
             FROM payments p 
             JOIN test_attempts ta ON p.test_attempt_id = ta.id
             JOIN users u ON ta.user_id = u.id
             ORDER BY p.id DESC`
        );
        const questions = await db.query('SELECT * FROM questions ORDER BY id ASC');

        res.json({
            users: users.rows,
            tests: tests.rows,
            payments: payments.rows,
            questions: questions.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch admin data' });
    }
});

// 10. Admin Route: Delete a Question
app.delete('/api/admin/questions/:id', requireAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM questions WHERE id = $1', [req.params.id]);
        res.json({ message: 'Question deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
