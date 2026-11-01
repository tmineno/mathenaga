---
chapter: 1
title: 収束と距離
subtitle: 「近さ」を数で測る
line: main
---

::: goal
(未執筆)点列の収束を、距離空間の言葉で述べられるようになる。
:::

::: motivation
(未執筆)
:::

## 点列の収束 {#convergence requires=reading-proofs}

::: summary
(未執筆)番号が進むと、ある点にいくらでも近づいて離れない点列。
:::

::: definition {name="点列の収束" en="convergence of a sequence"}
点列 $(x_n)$ が $x$ に収束するとは、任意の $\varepsilon > 0$ に対してある番号 $N$ があり、$n \ge N$ ならば $d(x_n, x) < \varepsilon$ となることをいう。
:::

## 距離空間 {#metric-space requires=convergence}

::: summary
(未執筆)2点の「近さ」を測る関数を備えた集合。
:::

::: definition {name="距離空間" en="metric space"}
集合 $X$ と関数 $d: X \times X \to \mathbb{R}$ の組で、すべての $x, y, z$ について $d(x, y) \ge 0$、$d(x, y) = 0 \iff x = y$、$d(x, y) = d(y, x)$、$d(x, z) \le d(x, y) + d(y, z)$ をみたすもの。
:::

::: definition {#uniform-convergence name="一様収束" en="uniform convergence"}
関数列 $f_n$ が $f$ に一様収束するとは、$\sup_t |f_n(t) - f(t)| \to 0$ となることをいう。sup 距離 $d_\infty$ での収束と同じ意味。
:::

::: review
- (未執筆)
:::
