# Notes on "Attention Is All You Need"

Reading notes for the Transformer paper (Vaswani et al., 2017, arXiv:1706.03762).
Seeded into the mock DB alongside the source PDF so semantic + keyword search have
real content to return.

## The one-sentence summary

The Transformer drops recurrence and convolutions entirely and relies only on
**self-attention** to draw global dependencies between input and output tokens.

## Why it matters

- Recurrent models process tokens sequentially, which blocks parallelism and makes
  long-range dependencies expensive to learn.
- Self-attention relates every position to every other position in O(1) sequential
  steps, so the whole sequence is processed in parallel.
- Result: better translation quality (28.4 BLEU on WMT14 EN-DE) at a fraction of the
  training cost of prior state-of-the-art models.

## Key ideas to remember

- **Scaled dot-product attention**: softmax(QKᵀ / √d_k) · V. The √d_k scaling keeps
  gradients stable for large key dimensions.
- **Multi-head attention**: run attention h times in parallel on projected subspaces,
  then concatenate. Lets the model attend to different representation subspaces at once.
- **Positional encoding**: since there is no recurrence, sinusoidal position signals are
  added to embeddings so the model knows token order.
- **Encoder-decoder stacks**: 6 identical layers each, residual connections + layer norm
  around every sub-layer.

## Follow-up questions

- How does multi-head attention compare to a single head of full dimension in practice?
- Why sinusoidal positional encodings instead of learned ones (the paper says results
  were nearly identical)?
