CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100),
    email VARCHAR(150) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL, -- 'logic', 'patterns', 'memory', 'reasoning'
    question_text TEXT NOT NULL,
    image_url TEXT,
    options JSONB NOT NULL, -- e.g., ["Option A", "Option B", "Option C", "Option D"]
    correct_option_index INT NOT NULL, -- 0, 1, 2, or 3
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE test_attempts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    raw_score INT NOT NULL,
    iq_score INT NOT NULL,
    category_breakdown JSONB NOT NULL,
    is_unlocked BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    test_attempt_id INT REFERENCES test_attempts(id) ON DELETE CASCADE,
    reference VARCHAR(100) UNIQUE NOT NULL,
    amount_kobo INT NOT NULL,
    status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'success', 'failed'
    paid_at TIMESTAMP
);

CREATE TABLE app_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
);

-- Set default report unlock price to 2,500 NGN (250,000 Kobo)
INSERT INTO app_settings (setting_key, setting_value) 
VALUES ('report_price_kobo', '250000');
