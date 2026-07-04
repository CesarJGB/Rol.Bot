import re
import random

DIRECTIVES_MILD = [
    "Change your opening sentence completely. Don't start the way you did before.",
    "Take a sharply different emotional angle — restrained instead of open, or vice versa.",
    "Open with a gesture or a small physical detail instead of dialogue.",
    "Use a different rhythm: shorter, more clipped sentences.",
    "Lean into subtext. Hint instead of stating.",
    "Begin mid-action. Skip pleasantries.",
]

DIRECTIVES_STRONG = [
    "DRAMATICALLY change the emotional direction. If you were warm, be cold. If amused, be wounded. If quiet, be sharp.",
    "Take a completely different narrative beat. Don't react to what was said — react to something *else* in the scene: a sound, a memory, an object, the silence.",
    "Use a totally different body language register: turn away, move closer, sit down, pace, anything but what you did before.",
    "Reverse the power dynamic of the previous reply. If you were yielding, push back. If you were probing, retreat.",
    "Skip the dialogue entirely for the first half. Pure action and atmosphere.",
    "Open with a question that catches the user off-guard. Don't answer theirs at all yet.",
]

DIRECTIVES_EXTREME = [
    "Completely upend the scene. Introduce something unexpected: a new sound, an interruption, a sudden mood swing, a memory triggering, a decision being made.",
    "The character makes an UNEXPECTED choice. They walk out. They confess something. They lie. They laugh inappropriately. They go silent and refuse to engage. Pick one and commit.",
    "Subvert the user's expectation entirely. Whatever they think will happen — do the opposite.",
    "Let the character break their own pattern. Show a hidden side: vulnerability if they're stoic, cruelty if they're kind, doubt if they're confident.",
    "Shift the entire tone of the scene. If it was tense, defuse it. If it was tender, crack it. If it was playful, darken it.",
    "Have the character interrupt themselves mid-thought and pivot to something completely different.",
]

CUT_OFF_PATTERN = re.compile(r'[.!?…»"\'\)\]\*]\s*$', re.MULTILINE)

def looks_cut_off(text: str) -> bool:
    t = text.strip()
    if not t or len(t) < 20:
        return False
    if t.count("*") % 2 != 0:
        return True
    return not bool(CUT_OFF_PATTERN.search(t))

def pick_directives(attempt: int) -> str:
    bucket = DIRECTIVES_MILD if attempt <= 1 else (DIRECTIVES_STRONG if attempt == 2 else DIRECTIVES_EXTREME)
    picks = random.sample(bucket, k=min(2, len(bucket)))
    return " ".join(picks)
