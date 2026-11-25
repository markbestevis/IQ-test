INSERT INTO questions (category, question_text, image_url, options, correct_option_index) VALUES

-- LOGIC (3 Questions)
(
    'logic',
    'All Bloops are Razzies, and all Razzies are Lazzies. Therefore, all Bloops are definitely Lazzies.',
    NULL,
    '["True", "False", "Cannot be determined", "Only if some Lazzies are Bloops"]',
    0
),
(
    'logic',
    'If it rains, the ground gets wet. The ground is not wet. What can you conclude?',
    NULL,
    '["It rained earlier", "It did not rain", "The ground is covered", "Nothing can be concluded"]',
    1
),
(
    'logic',
    'Three switches outside a closed room control three lightbulbs inside. You can flip the switches however you want, then open the door once. How many bulbs can you identify with 100% certainty?',
    NULL,
    '["Only 1", "Up to 2", "All 3", "None without a window"]',
    2
),

-- PATTERNS (3 Questions)
(
    'patterns',
    'Which number comes next in the sequence: 2, 6, 12, 20, 30, ...?',
    NULL,
    '["36", "40", "42", "44"]',
    2
),
(
    'patterns',
    'Complete the letter series: A, C, F, J, O, ...?',
    NULL,
    '["S", "T", "U", "V"]',
    2
),
(
    'patterns',
    'Find the missing number in the pattern: 3, 9, 27, 81, ...?',
    NULL,
    '["162", "243", "324", "216"]',
    1
),

-- MEMORY (3 Questions)
(
    'memory',
    'Study this code briefly: K7 - M4 - P9 - R2. Which letter was paired with the number 9?',
    NULL,
    '["K", "M", "P", "R"]',
    2
),
(
    'memory',
    'Read this sequence once: Blue, Circle, 48, River, North. What was the third item in the list?',
    NULL,
    '["Circle", "48", "River", "North"]',
    1
),
(
    'memory',
    'Examine the word "CONCENTRATION". If you remove all vowels, which letter appears third from the left?',
    NULL,
    '["N", "C", "T", "R"]',
    0
),

-- REASONING (3 Questions)
(
    'reasoning',
    'A bat and a ball cost ₦1,100 in total. The bat costs ₦1,000 more than the ball. How much does the ball cost?',
    NULL,
    '["₦100", "₦50", "₦150", "₦200"]',
    1
),
(
    'reasoning',
    'If 5 machines take 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?',
    NULL,
    '["100 minutes", "20 minutes", "5 minutes", "1 minute"]',
    2
),
(
    'reasoning',
    'Mary''s father has five daughters: Nana, Nene, Nini, Nono, and what is the name of the fifth daughter?',
    NULL,
    '["Nunu", "Mary", "Nana", "Nina"]',
    1
);
