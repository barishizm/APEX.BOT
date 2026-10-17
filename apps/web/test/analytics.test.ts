import { describe, test } from "node:test"
import assert from "node:assert/strict"
import type { QuestionRow } from "@apex/db"
import { groupUnanswered, languageMix, topTopics } from "../lib/analytics.ts"

const q = (content: string, sourced: boolean | null = true, unanswered: boolean | null = false, topic: string | null = null): QuestionRow => ({
  content,
  sourced,
  unanswered,
  topic,
})

describe("topTopics", () => {
  test("groups inflected forms of the same word and ranks by questions", () => {
    const topics = topTopics([
      q("Kargo ücreti ne kadar?"),
      q("Kargom nerede?", false, true),
      q("Kargo kaç günde gelir?"),
      q("İade nasıl yapılır?"),
      q("İadesi olan ürün ne zaman ödenir?"),
      q("Merhaba"),
    ])
    assert.equal(topics[0].label.split(" · ")[0], "kargo")
    assert.equal(topics[0].questions, 3)
    assert.equal(topics[0].unanswered, 1)
    assert.equal(topics[0].sourced, 2)
    assert.equal(topics[0].replied, 3)
    assert.equal(topics[1].questions, 2)
    assert.ok(topics[1].keywords[0].startsWith("iade"))
    // a question counts towards one topic only
    assert.ok(topics.reduce((n, t) => n + t.share, 0) <= 1)
  })

  test("works across languages and ignores one-off words", () => {
    const topics = topTopics([q("How long does shipping take?"), q("Shipping to Latvia?"), q("Kiek kainuoja pristatymas?"), q("pristatymo kaina")])
    assert.deepEqual(
      topics.map((t) => t.questions),
      [2, 2],
    )
    assert.deepEqual(topTopics([q("hello"), q("ok")]), [])
  })

  test("uses stored labels once they cover most questions, leaving out names and greetings", () => {
    const topics = topTopics([
      q("Merhaba Barış", null, null, ""),
      q("Barış bey merhaba", null, null, ""),
      q("Kargo ne kadar?", true, false, "Kargo ücreti"),
      q("Ücretsiz kargo var mı?", false, true, "kargo ücreti"),
      q("Kargo ücreti?", true, false, "Kargo ücreti"),
      q("İade nasıl yapılır?", true, false, "İade"),
      q("İade süresi?", true, false, "İade"),
      q("Tek soru", true, false, "Tek konu"),
      q("Henüz etiketlenmedi"),
    ])
    assert.deepEqual(
      topics.map((t) => [t.title, t.questions]),
      [
        ["Kargo ücreti", 3],
        ["İade", 2],
      ],
    )
    assert.equal(topics[0].unanswered, 1)
    assert.deepEqual(topics[0].keywords, ["Kargo ücreti"])
    // shares are of the labeled questions, greetings included
    assert.equal(topics[0].share, 3 / 8)
  })

  test("groups by words while most questions are still unlabeled", () => {
    const topics = topTopics([q("Kargo ne kadar?", true, false, "Kargo ücreti"), q("Kargo nerede?"), q("Kargo süresi?")])
    assert.equal(topics[0].questions, 3)
    assert.equal(topics[0].title, "Kargo")
  })

  test("examples skip repeats", () => {
    const [t] = topTopics([q("Kargo ücretsiz mi?"), q("kargo ücretsiz mi"), q("Kargo ne zaman?")])
    assert.deepEqual(t.examples, ["Kargo ücretsiz mi?", "Kargo ne zaman?"])
  })
})

describe("languageMix", () => {
  test("counts each detected language, the rest as other", () => {
    const mix = languageMix([q("Kargo ücretsiz mi?"), q("What is the price?"), q("Kiek kainuoja?"), q("👍")])
    assert.equal(mix.tr, 1)
    assert.equal(mix.en, 1)
    assert.equal(mix.lt, 1)
    assert.equal(mix.other, 1)
  })
})

describe("groupUnanswered", () => {
  test("merges repeats, keeping the latest wording, and sorts by count", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 16, 12, m))
    const groups = groupUnanswered([
      { replyId: "r3", conversationId: "c3", question: "Hafta sonu açık mısınız?", askedAt: at(3) },
      { replyId: "r2", conversationId: "c2", question: "Marsa kargo var mi", askedAt: at(2) },
      { replyId: "r1", conversationId: "c1", question: "Mars'a kargo var mı?", askedAt: at(1) },
    ])
    assert.equal(groups.length, 2)
    assert.equal(groups[0].count, 2)
    assert.equal(groups[0].question, "Marsa kargo var mi")
    assert.deepEqual(groups[0].replyIds, ["r2", "r1"])
    assert.equal(groups[0].conversationId, "c2")
    assert.equal(groups[1].question, "Hafta sonu açık mısınız?")
  })
})
