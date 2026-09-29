-- Test data seed for local development
-- Assumes dev user (00000000-0000-0000-0000-000000000001) and board (00000000-0000-0000-0000-000000000002) exist
-- Assumes statuses exist (created by provisioner or prior seed)

-- Get status IDs from the board
DO $$
DECLARE
    v_board_id UUID := '00000000-0000-0000-0000-000000000002';
    v_todo_id UUID;
    v_blocked_id UUID;
    v_inprog_id UUID;
    v_done_id UUID;
    v_proj_life UUID;
    v_proj_work UUID;
    v_epic_cumin UUID;
    v_epic_gym UUID;
    v_epic_interview UUID;
    v_epic_catchall UUID;
    v_sprint_1 UUID;
    v_sprint_2 UUID;
BEGIN
    SELECT id INTO v_todo_id FROM statuses WHERE board_id = v_board_id AND is_initial = true LIMIT 1;
    SELECT id INTO v_blocked_id FROM statuses WHERE board_id = v_board_id AND name = 'BLOCKED' LIMIT 1;
    SELECT id INTO v_inprog_id FROM statuses WHERE board_id = v_board_id AND name = 'IN PROGRESS' LIMIT 1;
    SELECT id INTO v_done_id FROM statuses WHERE board_id = v_board_id AND is_done = true LIMIT 1;

    -- Projects
    INSERT INTO projects (id, board_id, name, prefix, item_seq, color, description)
    VALUES
        (gen_random_uuid(), v_board_id, 'Life', 'LIFE', 0, '#7c3aed', 'Personal life goals')
    RETURNING id INTO v_proj_life;

    INSERT INTO projects (id, board_id, name, prefix, item_seq, color, description)
    VALUES
        (gen_random_uuid(), v_board_id, 'Work', 'WRK', 0, '#2563eb', 'Career and professional')
    RETURNING id INTO v_proj_work;

    -- Epics
    INSERT INTO epics (id, board_id, name, type, color, description, deadline, project_id)
    VALUES
        (gen_random_uuid(), v_board_id, 'Cumin MVP', 'goal', '#7c3aed', 'Build the sprint board app', '2026-07-01', v_proj_life)
    RETURNING id INTO v_epic_cumin;

    INSERT INTO epics (id, board_id, name, type, color, description, deadline, project_id)
    VALUES
        (gen_random_uuid(), v_board_id, 'Gym', 'recurring', '#16a34a', '3-4 sessions per sprint', NULL, v_proj_life)
    RETURNING id INTO v_epic_gym;

    INSERT INTO epics (id, board_id, name, type, color, description, deadline, project_id)
    VALUES
        (gen_random_uuid(), v_board_id, 'Interview Prep', 'goal', '#dc2626', 'Algorithms, system design, behavioral', '2026-06-15', v_proj_work)
    RETURNING id INTO v_epic_interview;

    INSERT INTO epics (id, board_id, name, type, color, description, deadline, project_id)
    VALUES
        (gen_random_uuid(), v_board_id, 'Catchall Q2', 'catchall', '#6b7280', 'One-off tasks for Q2', '2026-06-30', NULL)
    RETURNING id INTO v_epic_catchall;

    -- Sprints
    INSERT INTO sprints (id, board_id, name, start_date, end_date, state)
    VALUES
        (gen_random_uuid(), v_board_id, 'Sprint 1', '2026-06-09', '2026-06-15', 'active')
    RETURNING id INTO v_sprint_1;

    INSERT INTO sprints (id, board_id, name, start_date, end_date, state)
    VALUES
        (gen_random_uuid(), v_board_id, 'Sprint 2', '2026-06-16', '2026-06-22', 'planning')
    RETURNING id INTO v_sprint_2;

    -- Items (using project sequence)
    -- LIFE project items
    UPDATE projects SET item_seq = 6 WHERE id = v_proj_life;

    INSERT INTO items (board_id, project_id, epic_id, sprint_id, status_id, display_id, title, description, priority, estimate_minutes, position)
    VALUES
        (v_board_id, v_proj_life, v_epic_cumin, v_sprint_1, v_done_id, 'LIFE-1', 'Design data models for Cumin', 'ERD + migration files', 1, 120, 0),
        (v_board_id, v_proj_life, v_epic_cumin, v_sprint_1, v_inprog_id, 'LIFE-2', 'Set up Vite + React frontend', 'Scaffold with Tailwind', 1, 60, 0),
        (v_board_id, v_proj_life, v_epic_gym, v_sprint_1, v_todo_id, 'LIFE-3', 'Gym session - upper body', 'Bench, OHP, rows', 2, 60, 0),
        (v_board_id, v_proj_life, v_epic_cumin, v_sprint_1, v_todo_id, 'LIFE-4', 'Build board kanban UI', 'Drag and drop columns', 1, 180, 1),
        (v_board_id, v_proj_life, v_epic_gym, v_sprint_1, v_todo_id, 'LIFE-5', 'Gym session - legs', 'Squats, RDL, lunges', 2, 60, 2),
        (v_board_id, v_proj_life, v_epic_catchall, v_sprint_1, v_blocked_id, 'LIFE-6', 'Fix kitchen tap', 'Waiting on plumber availability', 3, NULL, 0);

    -- WRK project items
    UPDATE projects SET item_seq = 4 WHERE id = v_proj_work;

    INSERT INTO items (board_id, project_id, epic_id, sprint_id, status_id, display_id, title, description, priority, estimate_minutes, position)
    VALUES
        (v_board_id, v_proj_work, v_epic_interview, v_sprint_1, v_todo_id, 'WRK-1', 'Leetcode - binary search variations', 'Rotated sorted array, find min', 0, 90, 3),
        (v_board_id, v_proj_work, v_epic_interview, v_sprint_1, v_todo_id, 'WRK-2', 'Read DDIA chapter 5 - Replication', '', 1, 120, 4),
        (v_board_id, v_proj_work, v_epic_interview, v_sprint_1, v_inprog_id, 'WRK-3', 'Mock system design interview', 'URL shortener with friend', 0, 90, 1),
        (v_board_id, v_proj_work, v_epic_interview, NULL, v_todo_id, 'WRK-4', 'Behavioral interview prep', 'STAR format stories', 2, 60, 0);

    -- Backlog item (no sprint)
    UPDATE projects SET item_seq = item_seq + 1 WHERE id = v_proj_life;
    INSERT INTO items (board_id, project_id, epic_id, sprint_id, status_id, display_id, title, description, priority, estimate_minutes, position)
    VALUES
        (v_board_id, v_proj_life, v_epic_cumin, NULL, v_todo_id, 'LIFE-7', 'Add Google OAuth login', 'JWT in httpOnly cookie', 1, 240, 0);
    UPDATE projects SET item_seq = 7 WHERE id = v_proj_life;

    -- Status transitions for items that moved
    INSERT INTO status_transitions (item_id, from_status_id, to_status_id, transitioned_at)
    SELECT id, NULL, v_todo_id, created_at - INTERVAL '3 days' FROM items WHERE display_id = 'LIFE-1';
    INSERT INTO status_transitions (item_id, from_status_id, to_status_id, transitioned_at)
    SELECT id, v_todo_id, v_inprog_id, created_at - INTERVAL '2 days' FROM items WHERE display_id = 'LIFE-1';
    INSERT INTO status_transitions (item_id, from_status_id, to_status_id, transitioned_at)
    SELECT id, v_inprog_id, v_done_id, created_at - INTERVAL '1 day' FROM items WHERE display_id = 'LIFE-1';

    INSERT INTO status_transitions (item_id, from_status_id, to_status_id, transitioned_at)
    SELECT id, NULL, v_todo_id, created_at - INTERVAL '2 days' FROM items WHERE display_id = 'LIFE-2';
    INSERT INTO status_transitions (item_id, from_status_id, to_status_id, transitioned_at)
    SELECT id, v_todo_id, v_inprog_id, NOW() - INTERVAL '6 hours' FROM items WHERE display_id = 'LIFE-2';

END $$;
