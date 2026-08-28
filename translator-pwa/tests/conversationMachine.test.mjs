import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  conversationReducer,
  initialConversationState,
  oppositeOfActive,
} from "../src/lib/conversationMachine.ts";

/** @typedef {import("../src/lib/conversationMachine.ts").ConversationState} ConversationState */

describe("Conversation Machine - initial state", () => {
  it("starts with both sides idle and no active side", () => {
    assert.equal(initialConversationState.es, "idle");
    assert.equal(initialConversationState.ja, "idle");
    assert.equal(initialConversationState.activeSide, null);
    assert.equal(initialConversationState.turnIndex, 0);
    assert.equal(initialConversationState.sessionId, null);
    assert.equal(initialConversationState.error, null);
  });
});

describe("Conversation Machine - ENTER_CONVERSATION", () => {
  it("initializes session, sets ES listening when start side is ES", () => {
    const next = conversationReducer(initialConversationState, {
      type: "ENTER_CONVERSATION",
      sessionId: "sess-1",
      startSide: "es",
    });
    assert.equal(next.sessionId, "sess-1");
    assert.equal(next.es, "listening");
    assert.equal(next.ja, "idle");
    assert.equal(next.activeSide, "es");
    assert.equal(next.turnIndex, 0);
  });

  it("initializes session, sets JA listening when start side is JA", () => {
    const next = conversationReducer(initialConversationState, {
      type: "ENTER_CONVERSATION",
      sessionId: "sess-2",
      startSide: "ja",
    });
    assert.equal(next.ja, "listening");
    assert.equal(next.es, "idle");
    assert.equal(next.activeSide, "ja");
  });
});

describe("Conversation Machine - EXIT_CONVERSATION", () => {
  it("resets to initial state", () => {
    const afterEnter = {
      ...initialConversationState,
      sessionId: "sess-1",
      es: "listening",
      activeSide: "es",
      turnIndex: 3,
      lastTranslation: "Hola",
    };
    const next = conversationReducer(afterEnter, { type: "EXIT_CONVERSATION" });
    assert.deepEqual(next, initialConversationState);
  });
});

describe("Conversation Machine - OPEN_MIC", () => {
  it("opens the requested side when no other is active", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
    };
    const next = conversationReducer(after, { type: "OPEN_MIC", side: "es" });
    assert.equal(next.es, "listening");
    assert.equal(next.activeSide, "es");
  });

  it("does not open the requested side when the other side is already active", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      ja: "listening",
      activeSide: "ja",
    };
    const next = conversationReducer(after, { type: "OPEN_MIC", side: "es" });
    assert.equal(next.es, "idle");
    assert.equal(next.activeSide, "ja");
  });

  it("does not open the requested side when no session is active", () => {
    const next = conversationReducer(initialConversationState, { type: "OPEN_MIC", side: "es" });
    assert.equal(next.es, "idle");
    assert.equal(next.activeSide, null);
  });

  it("does not open if requested side is already active (e.g. speaking)", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      es: "speaking",
      activeSide: "es",
    };
    const next = conversationReducer(after, { type: "OPEN_MIC", side: "es" });
    assert.equal(next.es, "speaking");
  });
});

describe("Conversation Machine - SEND_AUDIO", () => {
  it("transitions the listening side to processing", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      es: "listening",
      activeSide: "es",
    };
    const next = conversationReducer(after, { type: "SEND_AUDIO", side: "es" });
    assert.equal(next.es, "processing");
    assert.equal(next.activeSide, "es");
  });

  it("is a no-op when the side is not listening", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      ja: "listening",
      activeSide: "ja",
    };
    const next = conversationReducer(after, { type: "SEND_AUDIO", side: "es" });
    assert.equal(next.es, "idle");
    assert.equal(next.activeSide, "ja");
  });
});

describe("Conversation Machine - RECEIVE_RESULT", () => {
  it("stores the translation, clears active side, increments turn index", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      es: "processing",
      activeSide: "es",
      turnIndex: 2,
    };
    const next = conversationReducer(after, {
      type: "RECEIVE_RESULT",
      side: "es",
      translation: "こんにちは",
      detected: "es",
      originalText: "Hola",
    });
    assert.equal(next.es, "idle");
    assert.equal(next.activeSide, null);
    assert.equal(next.turnIndex, 3);
    assert.equal(next.lastTranslation, "こんにちは");
    assert.equal(next.lastDetectedLanguage, "es");
    assert.equal(next.lastOriginalText, "Hola");
  });
});

describe("Conversation Machine - START_SPEAKING / FINISH_SPEAKING", () => {
  it("starts speaking on a side when no other side is active", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
    };
    const next = conversationReducer(after, { type: "START_SPEAKING", side: "ja" });
    assert.equal(next.ja, "speaking");
    assert.equal(next.activeSide, "ja");
  });

  it("does not start speaking if someone else is active", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      es: "listening",
      activeSide: "es",
    };
    const next = conversationReducer(after, { type: "START_SPEAKING", side: "ja" });
    assert.equal(next.ja, "idle");
    assert.equal(next.activeSide, "es");
  });

  it("finishes speaking and clears activeSide", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      ja: "speaking",
      activeSide: "ja",
    };
    const next = conversationReducer(after, { type: "FINISH_SPEAKING" });
    assert.equal(next.ja, "idle");
    assert.equal(next.activeSide, null);
  });
});

describe("Conversation Machine - FORCE_TURN", () => {
  it("opens the requested side when it is idle", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
    };
    const next = conversationReducer(after, { type: "FORCE_TURN", side: "ja" });
    assert.equal(next.ja, "listening");
    assert.equal(next.activeSide, "ja");
  });

  it("does nothing if the requested side is not idle", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      ja: "processing",
    };
    const next = conversationReducer(after, { type: "FORCE_TURN", side: "ja" });
    assert.equal(next.ja, "processing");
  });
});

describe("Conversation Machine - ABORT_ACTIVE", () => {
  it("aborts only if there is an active side", () => {
    const after = {
      ...initialConversationState,
      sessionId: "sess-1",
      es: "listening",
      activeSide: "es",
    };
    const next = conversationReducer(after, { type: "ABORT_ACTIVE" });
    assert.equal(next.es, "idle");
    assert.equal(next.activeSide, null);
  });

  it("is a no-op when no side is active", () => {
    const next = conversationReducer(initialConversationState, { type: "ABORT_ACTIVE" });
    assert.equal(next.activeSide, null);
  });
});

describe("Conversation Machine - oppositeOfActive helper", () => {
  it("returns the opposite of the active side", () => {
    assert.equal(
      oppositeOfActive({ ...initialConversationState, activeSide: "es" }),
      "ja"
    );
    assert.equal(
      oppositeOfActive({ ...initialConversationState, activeSide: "ja" }),
      "es"
    );
  });

  it("returns null when no side is active", () => {
    assert.equal(oppositeOfActive(initialConversationState), null);
  });
});

describe("Conversation Machine - full turn cycle", () => {
  it("walks ES listening → processing → idle, then JA speaking → idle", () => {
    let s = {
      ...initialConversationState,
      sessionId: "sess-1",
      es: "listening",
      activeSide: "es",
      turnIndex: 0,
    };

    s = conversationReducer(s, { type: "SEND_AUDIO", side: "es" });
    assert.equal(s.es, "processing");

    s = conversationReducer(s, {
      type: "RECEIVE_RESULT",
      side: "es",
      translation: "こんにちは",
      detected: "es",
      originalText: "Hola",
    });
    assert.equal(s.es, "idle");
    assert.equal(s.activeSide, null);
    assert.equal(s.turnIndex, 1);

    s = conversationReducer(s, { type: "START_SPEAKING", side: "ja" });
    assert.equal(s.ja, "speaking");
    assert.equal(s.activeSide, "ja");

    s = conversationReducer(s, { type: "FINISH_SPEAKING" });
    assert.equal(s.ja, "idle");
    assert.equal(s.activeSide, null);

    s = conversationReducer(s, { type: "OPEN_MIC", side: "ja" });
    assert.equal(s.ja, "listening");
    assert.equal(s.activeSide, "ja");
  });
});
