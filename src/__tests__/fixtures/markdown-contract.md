# Markdown Contract Fixture

## Inline formatting

This paragraph has **bold**, *italic*, ~~strike~~, [a safe link](https://example.com), and `inlineCode()`.

## Code fences

```ts title="contract-fixture.ts"
export const answer: number = 42;
```

```madeuplang
unknown language fallback
```

```diff
-const enabled = false;
+const enabled = true;
```

```python
print("language preservation")
```

```mermaid
flowchart LR
  Markdown --> Editor --> Markdown
```

## Lists and quotes

- Bullet item
- [x] Completed task
- [ ] Open task

1. Ordered item
2. Next item

> Block quote content.
>
> 1. Ordered inside a quote
>    - Nested bullet
>      - [x] Nested completed task

- Outer bullet
  1. Nested ordered item
     > Quote nested in a list

## Tables

| Feature | Status |
| --- | --- |
| Tables | Supported |

## Math

Inline math $x^2 + y^2 = z^2$.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

$$
\begin{aligned}
f(x) &= \sum_{n=0}^{\infty} \frac{x^n}{n!} \\
     &= e^x
\end{aligned}
$$

Hard break after this line.\
This stays in the same paragraph.

## Images and raw HTML

![Note asset](_page_1_Figure_2.png)

<mark>Safe highlight</mark>
<details><summary>Safe details</summary><kbd>Ctrl</kbd> + <kbd>S</kbd></details>

<section class="opaque-contract" data-contract="preserve">
  <table><tr><td colspan="2">Opaque HTML table</td></tr></table>
</section>

<div><strong>Malformed HTML that must remain recoverable

<script>alert("blocked")</script>
<img src="x" onerror="alert('blocked')" />
[bad link](javascript:alert('blocked'))
