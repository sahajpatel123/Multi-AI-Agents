# Pro Tier Rate Limiting Implementation Summary

## Overview
Implemented rolling window rate limiting for Pro tier users: **45 messages per 5 hour window**

## Rate Limits Summary
- **Guest**: 5 per day (unchanged)
- **Registered**: 7 per day (changed from 10)
- **Pro**: 45 per 5 hour rolling window (changed from unlimited)

## Backend Changes

### 1. Config (`backend/arena/config.py`)
Added Pro tier window configuration:
```python
pro_window_messages: int = 45
pro_window_hours: int = 5
```

### 2. New Module (`backend/arena/core/rate_limiter_pro.py`)
Created dedicated Pro tier rolling window rate limiter:
- `check_pro_window_limit(db, user_id)` - Checks if Pro user exceeded window limit
- Returns error dict with `reset_at`, `window_hours`, `current_count` if limit exceeded
- Calculates reset time based on oldest message in window + 5 hours

### 3. Cost Tracker (`backend/arena/core/cost_tracker.py`)
Updated rate limiting logic:
- Added import for `check_pro_window_limit`
- Updated `RateLimitExceeded` exception to include `reset_at` and `window_hours` parameters
- Modified `check_and_increment_user()` to call Pro window check for Pro users
- Updated registered user error message to reference Pro tier limits (not "unlimited")

## Frontend Changes

### 1. Pricing Page (`frontend/src/pages/PricingPage.tsx`)
- Updated Pro tier card: "45 messages per 5 hour window" (was "Unlimited questions")
- Updated FAQ answer about Pro tier

### 2. User Menu (`frontend/src/components/UserMenu.tsx`)
- Updated `REGISTERED_LIMIT` constant from 10 to 7
- Updated Pro tier usage display:
  - Shows: "{used} / 45 messages this window"
  - Shows: "Rolling 5 hour window" instead of "Unlimited prompts"

### 3. App Component (`frontend/src/App.tsx`)
- Added state for rate limit banner: `rateLimitBanner`
- Will display banner when 429 response received with reset time

## Rolling Window Logic
- **NOT** a daily reset at midnight
- Counts messages in the last 5 hours from current time
- Example: Message at 2pm counts until 7pm, then slot opens again
- Reset time = timestamp of oldest message in window + 5 hours

## Error Response Format
When Pro user hits limit, backend returns 429 with:
```json
{
  "error": "rate_limit_exceeded",
  "message": "You have reached the limit of 45 messages per 5 hours. Your window resets at HH:MM AM/PM UTC.",
  "limit": 45,
  "window_hours": 5,
  "reset_at": "2026-03-16T19:30:00",
  "current_count": 45
}
```

## Files Modified
**Backend:**
1. `backend/arena/config.py` - Added Pro window config
2. `backend/arena/core/rate_limiter_pro.py` - NEW FILE
3. `backend/arena/core/cost_tracker.py` - Updated rate limiting logic

**Frontend:**
1. `frontend/src/pages/PricingPage.tsx` - Updated Pro tier display
2. `frontend/src/components/UserMenu.tsx` - Updated usage counter
3. `frontend/src/App.tsx` - Added rate limit banner state

## Next Steps (TODO)
1. Add 429 error handling in App.tsx handleSubmit function
2. Add rate limit banner UI component above prompt input
3. Test compilation: `python3 -m compileall backend/arena`
4. Test compilation: `npm run build` in frontend
5. Test Pro tier rate limiting with actual usage
