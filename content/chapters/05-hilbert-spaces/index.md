---
title: ヒルベルト空間
subtitle: 無限個の直交する成分で、ベクトルを表せるか
line: analysis
---

::: goal
ベクトルを正規直交系で展開したときの係数と誤差を、内積で計算できるようになる。さらに、無限個の項による展開が元のベクトルに戻るための条件(正規直交系が完全であること)と、2乗の和が有限などんな係数の列からもベクトルが決まるための条件(空間が完備であること)を、区別して説明できるようになる。
:::

::: goal {field=physics}
状態をエネルギー固有関数で展開したとき、各準位の確率の和がちょうど 1 になることを、パーセヴァルの等式から示せるようになります。さらに、2乗の和が 1 になるように展開係数を決めれば、その係数をもつ状態が必ずあることを空間の完備性から導き、量子力学の状態空間にヒルベルト空間を使う理由を説明できるようになります。
:::

::: goal {field=cs}
音や画像などの信号を三角関数の成分に分け、小さな成分を捨てて圧縮するとき、誤差の2乗が、捨てた成分の係数の2乗の和で決まることを、パーセヴァルの等式から説明できるようになります。
:::

::: motivation
$\mathbb{R}^3$ の標準内積で、互いに直交する長さ 1 のベクトル $e_1 = (1, 0, 0)$、$e_2 = (0, 1, 0)$、$e_3 = (0, 0, 1)$ を考えます。どのベクトル $x$ も $x = \langle x, e_1 \rangle e_1 + \langle x, e_2 \rangle e_2 + \langle x, e_3 \rangle e_3$ と書け、長さの2乗は $\|x\|^2 = \langle x, e_1 \rangle^2 + \langle x, e_2 \rangle^2 + \langle x, e_3 \rangle^2$ です。係数は内積で取り出せ、長さの2乗は係数の2乗の和になります。

関数でも同じことをしたいところです。[[@norm-inner-product]] で見たとおり、定数と $\cos nt$、$\sin nt$ は互いに直交していて、フーリエ級数の係数は積分(内積)で取り出せます。ただし項は無限個あるので、二つの問いが生まれます。

1. 無限個の項を足したものは、元の関数に戻るか。[[@convergence-metric]] の方形波では、フーリエ級数は一様には収束しませんでした。戻るとしたら、どの距離で測った意味で戻るのか。
2. 逆に、係数の列を勝手に決めたとき、その係数をもつ関数はあるか。

1 は直交する関数が「足りているか」の問題で、2 は空間に「穴がないか」の問題です。
:::

::: motivation {field=physics}
[[@norm-inner-product]] の理論物理の応用では、箱の中の粒子の状態をエネルギー固有関数で展開し、各準位の確率の和が 1 を超えないこと(ベッセルの不等式)を示しました。量子力学では、確率の和はちょうど 1 でなければなりません。また [[@completeness-fixed-point]] では、合計が 1 になるようにどう確率を割り当てても、その割り当てをもつ状態があってほしい、という要請を見ました。前者は固有関数が足りていること、後者は状態空間に穴がないことにあたります。この章では、二つを別々の性質として示します。
:::

::: motivation {field=cs}
音声や画像の圧縮には、信号を周波数ごとの成分に分け、人が気づきにくい小さな成分を捨てたり粗く丸めたりする方法があります(変換符号化、transform coding)。成分を捨てると、元の信号とずれます。そのずれの大きさを、捨てた成分の大きさだけから知ることができれば、どこまで捨ててよいかを決められます。
:::

この章では、まず有限個の直交するベクトルで近似したときの係数と誤差を調べ、無限個の項による展開が元に戻る条件を、係数の2乗の和で言い換えます([[@orthonormal-system]])。次に、三角関数についてその条件が成り立つことを証明し、方形波のフーリエ級数が2乗誤差の意味で収束することを示します([[@fourier-series]])。最後に、2乗の和が有限な係数の列がいつもベクトルを決めるための条件として、内積空間の完備性を考えます。完備な内積空間が、ヒルベルト空間です([[@hilbert-space]])。

## 正規直交系 {#orthonormal-system requires=inner-product}

::: summary
互いに直交する長さ 1 のベクトルの列で、展開の係数を内積で取り出せるもの。
:::

::: why
平面のベクトル $x = (x_1, x_2)$ は $x = x_1 (1, 0) + x_2 (0, 1)$ と書け、係数の $x_1$ と $x_2$ は、$(1, 0)$ と $(0, 1)$ との標準内積で取り出せます。$(1, 0)$ と $(0, 1)$ が互いに直交し、長さが 1 だからです。[[内積空間]]でも、互いに直交する長さ 1 のベクトルがあれば、同じように内積で係数を取り出せます。[[@norm-inner-product]] の出発点の $\sin$ と $\cos$ がその例です。ただし関数の空間では、こうしたベクトルを有限個とっても、すべてのベクトルを線形結合で表せるとは限りません。表せないときに、有限個の線形結合で最もよく近似するには係数をどう選べばよいか、そのとき誤差はどれだけか、を調べます。
:::

::: definition {name="正規直交系" en="orthonormal system"}
[[内積空間]] $V$ のベクトルの列 $e_1, e_2, \dots$(有限個でも無限個でもよい)が正規直交系であるとは、すべての番号 $m, n$ について次が成り立つことをいう。

$$
\langle e_m, e_n \rangle = \begin{cases} 1 & (m = n) \\ 0 & (m \ne n) \end{cases}
$$
:::

どの二つも[[直交]]し、どれも長さが $\|e_n\| = 1$ である、ということです。正規直交系の線形結合の長さは、内積の対称性と線形性で展開すると、$m \ne n$ の項がすべて消えて

$$
\Bigl\| \sum_{n=1}^{N} b_n e_n \Bigr\|^2 = \sum_{m=1}^{N} \sum_{n=1}^{N} b_m b_n \langle e_m, e_n \rangle = \sum_{n=1}^{N} b_n^2
$$ {#orthonormal-length}

となります。また、直交する二つのベクトル $u, v$ については、同じ展開から $\|u + v\|^2 = \|u\|^2 + 2 \langle u, v \rangle + \|v\|^2 = \|u\|^2 + \|v\|^2$ です(ピタゴラスの定理、Pythagorean theorem)。

$x$ が $e_1, \dots, e_N$ の線形結合 $x = \sum_{n=1}^{N} a_n e_n$ なら、両辺と $e_m$ の内積をとると $\langle x, e_m \rangle = \sum_{n=1}^{N} a_n \langle e_n, e_m \rangle = a_m$ となり、係数は内積で取り出せます。この内積には名前が付いています。

::: definition {#fourier-coefficient name="フーリエ係数" en="Fourier coefficient"}
$(e_n)$ を内積空間 $V$ の正規直交系とする。$x \in V$ について、実数 $\langle x, e_n \rangle$ を、$x$ の $e_n$ に関するフーリエ係数という。
:::

$x$ が $e_1, \dots, e_N$ の線形結合でなくても、フーリエ係数を係数にした線形結合 $\sum_{n=1}^{N} \langle x, e_n \rangle e_n$ は作れます。これが $x$ の最もよい近似になっている、というのが次の定理です。

::: theorem {#best-approximation name="最良近似"}
$e_1, \dots, e_N$ を内積空間 $V$ の正規直交系とし、$x \in V$ について $c_n := \langle x, e_n \rangle$、$s_N := \sum_{n=1}^{N} c_n e_n$ と定める。このとき、次が成り立つ。

1. $x - s_N$ は、$e_1, \dots, e_N$ のどれとも直交する。
2. $\|x - s_N\|^2 = \|x\|^2 - \sum_{n=1}^{N} c_n^2$ である。
3. どんな実数 $a_1, \dots, a_N$ についても $\bigl\| x - \sum_{n=1}^{N} a_n e_n \bigr\|^2 = \|x - s_N\|^2 + \sum_{n=1}^{N} (a_n - c_n)^2$ である。特に、$e_1, \dots, e_N$ の線形結合のうち $x$ に最も近いものは、$s_N$ ただ一つである。
:::

::: proof-sketch
1. $\langle x - s_N, e_m \rangle = c_m - \sum_{n} c_n \langle e_n, e_m \rangle = c_m - c_m = 0$(内積の線形性と、正規直交系の定義を使う)。
2. $x = (x - s_N) + s_N$ と分けると、二つは直交するので $\|x\|^2 = \|x - s_N\|^2 + \|s_N\|^2$ で、$\|s_N\|^2 = \sum c_n^2$(1 と、ピタゴラスの定理と、[[@orthonormal-length]] を使う)。
3. $x - \sum a_n e_n = (x - s_N) + \sum (c_n - a_n) e_n$ と分けると、二つは直交するので 3 の等式が出る(1 と、ピタゴラスの定理と、[[@orthonormal-length]] を使う)。
:::

::: proof
**1.** 内積の線形性と正規直交系の定義から、$m = 1, \dots, N$ について

$$
\langle x - s_N, e_m \rangle = \langle x, e_m \rangle - \sum_{n=1}^{N} c_n \langle e_n, e_m \rangle = c_m - c_m = 0
$$

です。

**2.** $x = (x - s_N) + s_N$ と分けます。$s_N$ は $e_1, \dots, e_N$ の線形結合なので、内積の線形性と 1 から $\langle x - s_N, s_N \rangle = \sum_{n=1}^{N} c_n \langle x - s_N, e_n \rangle = 0$ です。ピタゴラスの定理と [[@orthonormal-length]] から

$$
\|x\|^2 = \|x - s_N\|^2 + \|s_N\|^2 = \|x - s_N\|^2 + \sum_{n=1}^{N} c_n^2
$$

となり、2 が出ます。

**3.** $x - \sum_{n=1}^{N} a_n e_n = (x - s_N) + \sum_{n=1}^{N} (c_n - a_n) e_n$ と分けます。右辺の第2項は $e_1, \dots, e_N$ の線形結合なので、2 と同じ理由で第1項と直交します。ピタゴラスの定理と [[@orthonormal-length]] から

$$
\Bigl\| x - \sum_{n=1}^{N} a_n e_n \Bigr\|^2 = \|x - s_N\|^2 + \sum_{n=1}^{N} (c_n - a_n)^2
$$

です。右辺の第2項は 0 以上で、0 になるのはすべての $n$ で $a_n = c_n$ のときだけなので、$x$ に最も近い線形結合は $s_N$ ただ一つです。
:::

1 は、誤差 $x - s_N$ が、近似に使ったどの方向とも直交していることを言っています。平面で、点から直線に下ろした垂線の足が、直線上で最も近い点になるのと同じです。$s_N$ を、$x$ の、$e_1, \dots, e_N$ の線形結合の全体への正射影 (orthogonal projection) と呼びます。2 は、誤差の2乗が、$x$ の長さの2乗からフーリエ係数の2乗の和を引いたものになることです。3 は、フーリエ係数から少しでも係数をずらすと、誤差が大きくなることです。

::: theorem {#bessel name="ベッセルの不等式"}
$(e_n)_{n \ge 1}$ を内積空間 $V$ の正規直交系で、無限個のベクトルからなるものとする。すべての $x \in V$ について、級数 $\sum_{n=1}^{\infty} \langle x, e_n \rangle^2$ は収束し、次が成り立つ。

$$
\sum_{n=1}^{\infty} \langle x, e_n \rangle^2 \le \|x\|^2
$$
:::

::: proof-sketch
1. 各 $N$ で $e_1, \dots, e_N$ に [[@best-approximation]] の 2 を使うと、$\sum_{n=1}^{N} c_n^2 = \|x\|^2 - \|x - s_N\|^2 \le \|x\|^2$(最良近似の 2 と、ノルムが 0 以上であることを使う)。
2. 部分和 $\sum_{n=1}^{N} c_n^2$ は $N$ とともに増え、$\|x\|^2$ を超えないので、収束する(上に有界な単調増加列は収束する、という実数の性質を使う)。
3. すべての $N$ で部分和が $\|x\|^2$ 以下なので、極限も $\|x\|^2$ 以下(極限をとっても $\le$ は保たれる、を使う)。
:::

::: proof
$c_n := \langle x, e_n \rangle$、$T_N := \sum_{n=1}^{N} c_n^2$ とおきます。各 $N$ で、$e_1, \dots, e_N$ は有限個のベクトルからなる正規直交系なので、[[@best-approximation]] の 2 から

$$
T_N = \|x\|^2 - \|x - s_N\|^2 \le \|x\|^2
$$

です。$T_{N+1} - T_N = c_{N+1}^2 \ge 0$ なので $(T_N)$ は単調増加で、上の不等式から $\|x\|^2$ を超えません。上に有界な単調増加列は収束するので、$(T_N)$ は収束します。すべての $N$ で $T_N \le \|x\|^2$ なので、極限も $\|x\|^2$ 以下です。
:::

[[@norm-inner-product]] の理論物理の応用で、箱の中の粒子の確率について示した不等式は、この定理の特別な場合です。等号が成り立つのはどんなときかを調べるために、まず無限個のベクトルの和の意味を決めます。

::: definition {#series name="級数" en="series"}
[[ノルム空間]] $V$ のベクトルの列 $(x_n)_{n \ge 1}$ について、部分和 $s_N := x_1 + x_2 + \dots + x_N$ の列 $(s_N)$ が $x \in V$ に収束するとき、級数 $\sum_{n=1}^{\infty} x_n$ は $x$ に収束するといい、$x = \sum_{n=1}^{\infty} x_n$ と書く。
:::

収束は、ノルムから決まる距離で考えます([[@normed-space]])。同じ級数でも、ノルムを変えると、収束するかどうかが変わることがあります。

::: definition {#complete-orthonormal-system name="完全正規直交系" en="complete orthonormal system" aliases="正規直交基底"}
内積空間 $V$ の正規直交系 $(e_n)_{n \ge 1}$ で、無限個のベクトルからなるものが完全であるとは、すべての $x \in V$ について次が成り立つことをいう。このとき $(e_n)$ を $V$ の完全正規直交系、または正規直交基底 (orthonormal basis) という。

$$
x = \sum_{n=1}^{\infty} \langle x, e_n \rangle e_n
$$
:::

フーリエ係数を係数にした級数が、どのベクトルについても元のベクトルに収束する、つまり直交する方向が足りている、ということです。$\mathbb{R}^m$ の $(1, 0, \dots, 0), \dots, (0, \dots, 0, 1)$ のような有限個の正規直交系も、すべての $x$ がフーリエ係数を係数にした線形結合で書けるとき、完全であるといいます。この章で調べたいのは、無限個の場合です。

::: theorem {#parseval name="パーセヴァルの等式"}
$(e_n)_{n \ge 1}$ を内積空間 $V$ の正規直交系で、無限個のベクトルからなるものとし、$x \in V$ とする。次の 1〜3 は同値である。

1. $x = \sum_{n=1}^{\infty} \langle x, e_n \rangle e_n$ である。
2. $\|x\|^2 = \sum_{n=1}^{\infty} \langle x, e_n \rangle^2$ である。
3. どんな $\varepsilon > 0$ についても、ある番号 $N$ と実数 $a_1, \dots, a_N$ があって、$\bigl\| x - \sum_{n=1}^{N} a_n e_n \bigr\| < \varepsilon$ となる。

特に、$(e_n)$ が完全であることと、すべての $x \in V$ について 2 の等式(パーセヴァルの等式、Parseval's identity)が成り立つことは、同値である。
:::

::: proof-sketch
1. [[@best-approximation]] の 2 から $\|x - s_N\|^2 = \|x\|^2 - \sum_{n=1}^{N} c_n^2$ なので、左辺が 0 に近づくことと右辺が 0 に近づくことは同じで、1 と 2 は同値(最良近似の 2 を使う)。
2. 1 なら、$a_n := c_n$ として 3 が成り立つ(級数の収束の定義を使う)。
3. 3 なら、$\|x - s_N\| \le \bigl\| x - \sum_{n=1}^{N} a_n e_n \bigr\| < \varepsilon$(最良近似の 3 を使う)。
4. $\|x - s_M\|$ は $M$ とともに増えないので、すべての $M \ge N$ で $\|x - s_M\| < \varepsilon$ となり、1 が成り立つ(最良近似の 2 を使う)。
:::

::: proof
$c_n := \langle x, e_n \rangle$、$s_N := \sum_{n=1}^{N} c_n e_n$ とおきます。

**1 と 2 が同値であること。** $e_1, \dots, e_N$ に [[@best-approximation]] の 2 を使うと、すべての $N$ で

$$
\|x - s_N\|^2 = \|x\|^2 - \sum_{n=1}^{N} c_n^2
$$

です。1 は左辺が $N \to \infty$ で 0 に近づくこと、2 は右辺が 0 に近づくことなので、二つは同じことです。

**1 ならば 3。** $\varepsilon > 0$ とします。1 から、ある $N$ で $\|x - s_N\| < \varepsilon$ となるので、$a_n := c_n$ とすれば 3 が成り立ちます。

**3 ならば 1。** $\varepsilon > 0$ とし、3 の $N$ と $a_1, \dots, a_N$ をとります。[[@best-approximation]] の 3 から、$\|x - s_N\| \le \bigl\| x - \sum_{n=1}^{N} a_n e_n \bigr\| < \varepsilon$ です。$M \ge N$ なら、[[@best-approximation]] の 2 から

$$
\begin{aligned}
\|x - s_M\|^2 &= \|x\|^2 - \sum_{n=1}^{M} c_n^2 \\
&\le \|x\|^2 - \sum_{n=1}^{N} c_n^2 = \|x - s_N\|^2 < \varepsilon^2
\end{aligned}
$$

です。$\varepsilon > 0$ はいくらでも小さくとれるので、$s_M$ は $x$ に収束します。

**最後の主張。** 完全であることは、すべての $x \in V$ について 1 が成り立つことです。1 と 2 は同値なので、これはすべての $x$ について 2 が成り立つことと同じです。
:::

2 は、無限個の方向についてのピタゴラスの定理です。長さの2乗が、フーリエ係数の2乗の和にちょうど等しくなります。3 は、有限個の線形結合でいくらでもよく近似できることで、係数をフーリエ係数に限らなくてよいので、確かめやすい条件です。[[@fourier-series]] では、三角関数が完全であることを 3 で確かめます。

::: examples
**座標を回した正規直交系。** $\mathbb{R}^2$ の $e_1 = (1, 1)/\sqrt{2}$、$e_2 = (1, -1)/\sqrt{2}$ は正規直交系です。$x = (3, 1)$ のフーリエ係数は $\langle x, e_1 \rangle = 4/\sqrt{2} = 2\sqrt{2}$、$\langle x, e_2 \rangle = 2/\sqrt{2} = \sqrt{2}$ で、$2\sqrt{2}\, e_1 + \sqrt{2}\, e_2 = (2, 2) + (1, -1) = (3, 1)$ と元に戻ります。$e_1$ だけで近似すると $s_1 = (2, 2)$ で、誤差の2乗は $\|(1, -1)\|^2 = 2$ です。これは [[@best-approximation]] の 2 の $\|x\|^2 - c_1^2 = 10 - 8$ と一致します。

**三角関数系。** [[@norm-inner-product]] の内積 $\langle f, g \rangle = \int_{-\pi}^{\pi} f(t) g(t)\,dt$ を入れた $C[-\pi, \pi]$ で考えます。積和の公式 $\cos mt \cos nt = \frac{1}{2}\bigl(\cos (m - n)t + \cos (m + n)t\bigr)$ などと、0 でない整数 $k$ について $\int_{-\pi}^{\pi} \cos kt\,dt = 0$、すべての整数 $k$ について $\int_{-\pi}^{\pi} \sin kt\,dt = 0$ であることを使うと、正の整数 $m, n$ について

$$
\begin{aligned}
\int_{-\pi}^{\pi} \cos mt \cos nt\,dt &= \begin{cases} \pi & (m = n) \\ 0 & (m \ne n) \end{cases} \\
\int_{-\pi}^{\pi} \sin mt \sin nt\,dt &= \begin{cases} \pi & (m = n) \\ 0 & (m \ne n) \end{cases} \\
\int_{-\pi}^{\pi} \cos mt \sin nt\,dt &= 0
\end{aligned}
$$

となります。さらに $\int_{-\pi}^{\pi} \cos nt\,dt = \int_{-\pi}^{\pi} \sin nt\,dt = 0$、$\int_{-\pi}^{\pi} 1\,dt = 2\pi$ です。したがって

$$
\frac{1}{\sqrt{2\pi}},\ \frac{\cos t}{\sqrt{\pi}},\ \frac{\sin t}{\sqrt{\pi}},\ \frac{\cos 2t}{\sqrt{\pi}},\ \frac{\sin 2t}{\sqrt{\pi}},\ \dots
$$ {#trig-system}

に、この順に番号を付けた列は正規直交系です。これを三角関数系 (trigonometric system) と呼びます。完全であることは [[@fourier-series]] で示します。

**完全でない正規直交系。** 三角関数系から最初の $1/\sqrt{2\pi}$ を除いた列も、正規直交系です。定数関数 1 は $\cos nt$ とも $\sin nt$ とも直交するので、この列に関するフーリエ係数はすべて 0 で、2乗の和は $0 < 2\pi = \|1\|^2$ です。[[@parseval]] の 2 が成り立たないので、この列は完全ではありません。無限個のベクトルからなる正規直交系でも、方向が足りているとは限りません。
:::

::: pitfall
**「完全」と「完備」。** 英語ではどちらも complete です。完全は正規直交系の性質で、直交する方向が足りていることです。[[completeness|完備]]は空間の性質で、コーシー列の行き先が空間の中にあることです。二つは別の性質で、[[@fourier-series]] の区分的に連続な関数の空間は、三角関数系という完全正規直交系をもちますが、完備ではありません([[@hilbert-space]])。完全正規直交系を「完備正規直交系」と呼ぶ本もあるので、どちらの意味かは定義で確かめてください。

**直交していない列では、項を足すと前の係数も変わる。** $C[0, 1]$ の内積 $\langle f, g \rangle = \int_0^1 f(t) g(t)\,dt$ で、$f(t) = t^2$ を定数で最もよく近似すると、定数関数 1 の長さは 1 なので、[[@best-approximation]] から $\langle t^2, 1 \rangle = 1/3$ です。ここに $t$ を足して $a + bt$ の形で最もよく近似すると $t - 1/6$ になり、定数項が $1/3$ から $-1/6$ に変わります。1 と $t$ は直交していない($\int_0^1 t\,dt = 1/2$)からです。1 と直交する長さ 1 の関数 $\sqrt{3}(2t - 1)$ を使うと、1 と $\sqrt{3}(2t - 1)$ の線形結合の全体は $a + bt$ の全体と同じで、$\langle t^2, \sqrt{3}(2t - 1) \rangle = \sqrt{3}/6$ なので、最良近似は $1/3 + (\sqrt{3}/6) \cdot \sqrt{3}(2t - 1) = t - 1/6$ です。正規直交系を使えば、項を足しても、それまでの係数 $1/3$ は変わりません。
:::

::: drop-assumption
**直交性を外す。** $\mathbb{R}^2$ の $u_1 = (1, 0)$ と $u_2 = (1, 1)/\sqrt{2}$ はどちらも長さ 1 ですが、$\langle u_1, u_2 \rangle = 1/\sqrt{2} \ne 0$ で、直交していません。$x = u_2$ について内積で求めた「係数」は $\langle x, u_1 \rangle = 1/\sqrt{2}$、$\langle x, u_2 \rangle = 1$ で、2乗の和は $3/2 > 1 = \|x\|^2$ となり、ベッセルの不等式が成り立ちません。この係数で作った線形結合 $(1/\sqrt{2})\, u_1 + u_2 = (\sqrt{2}, 1/\sqrt{2})$ も、$x$ には戻りません。直交していないと [[@best-approximation]] の 1 が成り立たず、誤差を直交する二つに分けるピタゴラスの定理が使えないからです。
:::

::: application {field=physics title="測定による状態の射影"}
[[@completeness-fixed-point]] の理論物理の応用で見た、幅 $L$ の箱の左半分で見つかった直後の状態 $\chi$ を考えます。エネルギー固有関数を $u_n(x) = \sqrt{2/L}\,\sin(n\pi x/L)$ として、$\chi$ は $0 \le x < L/2$ で $\sqrt{2}\, u_1(x)$、$L/2 < x \le L$ で 0 をとり、$x = L/2$ では両側の極限 $2/\sqrt{L}$ と 0 の平均 $1/\sqrt{L}$ をとる関数で、$\|\chi\|_2 = 1$ です。$\chi$ はとびのある関数なので、$[0, L]$ 上の区分的に連続な関数で、とびのある点では両側の極限の平均をとるものの全体に、内積 $\langle f, g \rangle = \int_0^L f(x) g(x)\,dx$ を入れた内積空間で考えます([[@piecewise-continuous]] と同じ作り方です)。

エネルギーを測って、$E_1$ か $E_2$ のどちらかが出たかどうかだけを調べる測定を考えます(どちらが出たかは区別しません)。測定の射影仮説では、その結果が出る確率は、$\chi$ を $u_1, u_2$ の線形結合の全体へ正射影したものの長さの2乗で、測定の直後の状態は、その正射影を長さ 1 にしたものです。フーリエ係数は $c_1 = \langle \chi, u_1 \rangle = 1/\sqrt{2}$ と、$\theta = \pi x/L$ と置き換えて

$$
\begin{aligned}
c_2 = \langle \chi, u_2 \rangle &= \frac{2\sqrt{2}}{L} \int_0^{L/2} \sin\frac{\pi x}{L} \sin\frac{2\pi x}{L}\,dx \\
&= \frac{2\sqrt{2}}{\pi} \int_0^{\pi/2} 2 \sin^2\theta \cos\theta\,d\theta \\
&= \frac{2\sqrt{2}}{\pi} \cdot \frac{2}{3} = \frac{4\sqrt{2}}{3\pi}
\end{aligned}
$$

です。[[@best-approximation]] から正射影は $s_2 = c_1 u_1 + c_2 u_2$ で、確率は $\|s_2\|^2 = c_1^2 + c_2^2 = 1/2 + 32/(9\pi^2) \approx 0.860$ です。測定の直後の状態は $s_2/\|s_2\|$ です。

残りの $\chi - s_2$ は $u_1$ とも $u_2$ とも直交し、$\|\chi - s_2\|^2 = 1 - 0.860 = 0.140$ が、「$E_1$ でも $E_2$ でもない」が出る確率です。二つの確率の和がちょうど 1 になるのは、$\chi = s_2 + (\chi - s_2)$ が直交する二つのベクトルに分かれ、ピタゴラスの定理が成り立つからです。$s_2$ は、$u_1$ と $u_2$ の線形結合のうち、$\chi$ に $L^2$ 距離で最も近い状態でもあります。
:::

::: application {field=cs title="最小二乗法"}
3点 $(t, y) = (-1, 1), (0, 2), (1, 4)$ に直線 $y = a + bt$ を当てはめ、誤差の2乗和 $\sum_{i=1}^{3} (y_i - a - b t_i)^2$ を最小にします(最小二乗法、least squares)。データを $\mathbb{R}^3$ のベクトル $y = (1, 2, 4)$ とみなすと、これは定数の列 $(1, 1, 1)$ と $t$ の列 $(-1, 0, 1)$ の線形結合で $y$ を最もよく近似する問題で、[[@best-approximation]] が使えます。二つの列は直交している(内積が 0)ので、長さで割った $e_1 = (1, 1, 1)/\sqrt{3}$、$e_2 = (-1, 0, 1)/\sqrt{2}$ は正規直交系です。

フーリエ係数は $\langle y, e_1 \rangle = 7/\sqrt{3}$、$\langle y, e_2 \rangle = 3/\sqrt{2}$ で、最良近似は

$$
s = \frac{7}{3}(1, 1, 1) + \frac{3}{2}(-1, 0, 1) = \left( \frac{5}{6}, \frac{7}{3}, \frac{23}{6} \right)
$$

です。当てはめた直線は $y = 7/3 + (3/2)\, t$ です。誤差 $y - s = (1/6, -1/3, 1/6)$ は $e_1$ とも $e_2$ とも直交し、誤差の2乗和は $\|y\|^2 - (49/3 + 9/2) = 21 - 125/6 = 1/6$ で、直接計算した $(1/6)^2 + (1/3)^2 + (1/6)^2 = 1/6$ と一致します。

$t$ の値が 0 を中心に対称でないときは、定数の列と $t$ の列が直交しません。そのときは $t$ からその平均を引いた列を使うと、直交する二つの列になります。機械学習の線形回帰は、同じ計算を多くの列で行うものです。
:::

## フーリエ級数 {#fourier-series requires=orthonormal-system}

::: summary
区分的に連続な関数を三角関数系で展開した級数で、2乗誤差が 0 に近づく意味で元の関数に収束するもの。
:::

::: why
[[@convergence-metric]] の理論物理の応用では、方形波のフーリエ級数の部分和 $S_N$ が、不連続点の近くで方形波から離れたままになり、一様には収束しないことを見ました。一方、そこでは2乗誤差 $\int_{-\pi}^{\pi} |S_N(t) - f(t)|^2\,dt$ は 0 に近づくと述べました。これを示すには、[[@parseval]] から、三角関数系が完全であることを示せばよいはずです。ただし方形波は連続ではないので、[[@orthonormal-system]] の $C[-\pi, \pi]$ には入りません。そこで、とびのある関数も入る内積空間を用意するところから始めます。積分は1点での値の違いを区別しないので、とびのある点での値の決め方に約束が要ります。
:::

::: definition {#piecewise-continuous name="区分的に連続" en="piecewise continuous"}
関数 $f: [-\pi, \pi] \to \mathbb{R}$ が区分的に連続であるとは、有限個の点 $-\pi = t_0 < t_1 < \dots < t_k = \pi$ があって、各開区間 $(t_{j-1}, t_j)$ で $f$ が連続であり、各 $t_j$ での区間の内側からの極限(片側極限)が有限の値で存在することをいう。右からの極限を $f(t + 0) := \lim_{s \to t,\, s > t} f(s)$、左からの極限を $f(t - 0)$ と書く。区分的に連続な関数で、さらに次をみたすものの全体を $\mathrm{PC}[-\pi, \pi]$ と書く。

$$
\begin{gathered}
f(t) = \frac{f(t - 0) + f(t + 0)}{2} \quad (-\pi < t < \pi) \\
f(-\pi) = f(\pi) = \frac{f(-\pi + 0) + f(\pi - 0)}{2}
\end{gathered}
$$
:::

区分的に連続な関数は、とびが有限個しかなく、とびの大きさも有限な関数です。後半の約束は、とびのある点では左右の極限の平均を値にし、両端の $-\pi$ と $\pi$ は周期 $2\pi$ でつながった1点とみなして、同じく平均をとる、ということです。とびのない点では左右の極限がどちらも $f(t)$ なので、約束は自動的にみたされます。[[@convergence-metric]] の方形波は、$t = 0$ と $t = \pm\pi$ で値を 0 にしていたので、この約束をみたしています。両端で値が等しい連続関数も、$\mathrm{PC}[-\pi, \pi]$ に入ります。

区分的に連続な関数は有界で、積分できます。各開区間 $(t_{j-1}, t_j)$ で両端の値を片側極限で補うと閉区間上の連続関数になり、閉区間上の連続関数は有界で積分できるからです(微分積分の事実として認めます)。積分は区間ごとの積分の和です。

$\mathrm{PC}[-\pi, \pi]$ は、各点ごとの足し算と実数倍で[[ベクトル空間]]になります。二つの関数のとびの点を合わせても有限個で、片側極限は足し算と実数倍を保つので、約束も保たれるからです。また

$$
\langle f, g \rangle := \int_{-\pi}^{\pi} f(t) g(t)\,dt
$$

は内積です。対称性と線形性は、積分の性質から分かります。正値性の「$\langle f, f \rangle = 0$ なら $f = 0$」は、次のように示します。開区間 $(t_{j-1}, t_j)$ の点 $t$ で $f(t) \ne 0$ なら、$f$ はそこで連続なので、$t$ を含む小さな区間で $f(s)^2 > f(t)^2/2$ となり、積分が正になってしまいます。したがって $f$ は各開区間で 0 で、片側極限も 0 です。とびのある点と両端の値は片側極限の平均なので、やはり 0 です。この約束がないと、1点だけで 0 でない関数も $\langle f, f \rangle = 0$ となり、正値性が崩れます(下の「仮定を外すと」)。以下、$\mathrm{PC}[-\pi, \pi]$ のノルムを $\|f\|_2 := \sqrt{\langle f, f \rangle}$ と書きます。三角関数系 [[@trig-system]] の関数は連続で、両端で値が等しいので、$\mathrm{PC}[-\pi, \pi]$ の正規直交系です。

::: definition {name="フーリエ級数" en="Fourier series"}
$f \in \mathrm{PC}[-\pi, \pi]$ について、

$$
\begin{aligned}
a_n &:= \frac{1}{\pi} \int_{-\pi}^{\pi} f(t) \cos nt\,dt \quad (n = 0, 1, 2, \dots) \\
b_n &:= \frac{1}{\pi} \int_{-\pi}^{\pi} f(t) \sin nt\,dt \quad (n = 1, 2, \dots)
\end{aligned}
$$

と定める。級数

$$
\frac{a_0}{2} + \sum_{n=1}^{\infty} (a_n \cos nt + b_n \sin nt)
$$

を $f$ のフーリエ級数といい、$S_N f(t) := \frac{a_0}{2} + \sum_{n=1}^{N} (a_n \cos nt + b_n \sin nt)$ をその第 $N$ 部分和という。
:::

三角関数系に関するフーリエ係数で書き直すと、$\langle f, 1/\sqrt{2\pi} \rangle = \sqrt{\pi/2}\, a_0$、$\langle f, \cos nt/\sqrt{\pi} \rangle = \sqrt{\pi}\, a_n$、$\langle f, \sin nt/\sqrt{\pi} \rangle = \sqrt{\pi}\, b_n$ なので、

$$
\begin{aligned}
\Bigl\langle f, \frac{1}{\sqrt{2\pi}} \Bigr\rangle \frac{1}{\sqrt{2\pi}} &= \frac{a_0}{2} \\
\Bigl\langle f, \frac{\cos nt}{\sqrt{\pi}} \Bigr\rangle \frac{\cos nt}{\sqrt{\pi}} &= a_n \cos nt \\
\Bigl\langle f, \frac{\sin nt}{\sqrt{\pi}} \Bigr\rangle \frac{\sin nt}{\sqrt{\pi}} &= b_n \sin nt
\end{aligned}
$$

です。つまり $S_N f$ は、三角関数系の最初の $2N + 1$ 個についての展開 $s_{2N+1}$ です。[[@best-approximation]] から、$S_N f$ は、$1, \cos t, \sin t, \dots, \cos Nt, \sin Nt$ の線形結合(次数 $N$ 以下の三角多項式、trigonometric polynomial)のうち、$\|\cdot\|_2$ で $f$ に最も近いものです。三角関数系が完全なら、[[@parseval]] の 2 は、$a_n, b_n$ で書くと

$$
\frac{1}{\pi} \int_{-\pi}^{\pi} f(t)^2\,dt = \frac{a_0^2}{2} + \sum_{n=1}^{\infty} (a_n^2 + b_n^2)
$$ {#parseval-trig}

となります。

完全であることは、[[@parseval]] の 3 で確かめます。つまり、どの $f$ も三角多項式でいくらでもよく近似できることを示します。そのための道具が、部分和の平均です。部分和 $S_N g$ そのものは、$g$ が連続でも一様に収束するとは限りません(下の落とし穴)。しかし部分和の平均(チェザロ平均、Cesàro mean)をとると、連続関数なら必ず一様に収束します。証明には、次の性質を使います。

::: definition {#uniformly-continuous name="一様連続" en="uniformly continuous"}
$I$ を実数の区間とする。関数 $g: I \to \mathbb{R}$ が一様連続であるとは、次が成り立つことをいう。

$$
\forall \varepsilon > 0\ \exists \delta > 0\ \forall s, t \in I: \bigl(|s - t| < \delta \Rightarrow |g(s) - g(t)| < \varepsilon\bigr)
$$
:::

各点で連続であることは、点 $t$ ごとに $\delta$ を選んでよいという条件です。一様連続は、すべての点で使える $\delta$ を一つ選べるという、より強い条件です。$(0, 1]$ 上の $1/t$ は連続ですが、一様連続ではありません。どんな $\delta > 0$ についても、$s < \delta$ なら $s$ と $s/2$ の距離は $\delta$ より小さいのに、値の差 $1/s$ はいくらでも大きくなるからです。有界閉区間上の連続関数は一様連続である、という事実が知られています。閉区間がコンパクトであること([[@heine-borel]])から導かれる事実で、ここでは認めます。

::: theorem {#fejer name="フェイェールの定理"}
$g$ を実数全体で連続な関数で、周期 $2\pi$ をもつ(すべての実数 $t$ で $g(t + 2\pi) = g(t)$)ものとする。$g$ の $[-\pi, \pi]$ でのフーリエ級数の部分和の平均を

$$
\sigma_N g := \frac{S_0 g + S_1 g + \dots + S_N g}{N + 1}
$$

と定めると、$\sigma_N g$ は $N \to \infty$ で $g$ に[[uniform-convergence|一様収束]]する。
:::

::: proof-sketch
1. $S_k g(x) = \frac{1}{2\pi}\int_{-\pi}^{\pi} g(x - s) D_k(s)\,ds$($D_k(s) := 1 + 2\sum_{n=1}^{k} \cos ns$)と書けるので、$\sigma_N g(x) = \frac{1}{2\pi}\int_{-\pi}^{\pi} g(x - s) F_N(s)\,ds$($F_N := (D_0 + \dots + D_N)/(N + 1)$)となる(三角関数の加法定理と、周期関数の1周期分の積分はどこから始めても同じ、を使う)。
2. $F_N(s) = \sin^2\bigl((N + 1)s/2\bigr) / \bigl((N + 1)\sin^2(s/2)\bigr)$ なので、$F_N \ge 0$、$\frac{1}{2\pi}\int_{-\pi}^{\pi} F_N(s)\,ds = 1$、$\delta \le |s| \le \pi$ で $F_N(s) \le 1/\bigl((N + 1)\sin^2(\delta/2)\bigr)$(積和の公式を使う)。
3. $\sigma_N g(x) - g(x) = \frac{1}{2\pi}\int_{-\pi}^{\pi} \bigl(g(x - s) - g(x)\bigr) F_N(s)\,ds$ を、$|s| < \delta$ の部分と $\delta \le |s| \le \pi$ の部分に分ける(2 の性質を使う)。
4. 前者は一様連続性から $\varepsilon$ 以下、後者は $2M/\bigl((N + 1)\sin^2(\delta/2)\bigr)$ 以下で、どちらも $x$ によらず小さくできる($M$ は $|g|$ の最大値。有界閉区間上の連続関数は有界で一様連続である、を使う)。
:::

::: proof
**積分で書く。** 正の整数 $n$ について、三角関数の加法定理から

$$
\begin{aligned}
&a_n \cos nx + b_n \sin nx \\
&\quad = \frac{1}{\pi} \int_{-\pi}^{\pi} g(t) (\cos nt \cos nx + \sin nt \sin nx)\,dt \\
&\quad = \frac{1}{\pi} \int_{-\pi}^{\pi} g(t) \cos n(x - t)\,dt
\end{aligned}
$$

です。$a_0/2 = \frac{1}{2\pi}\int_{-\pi}^{\pi} g(t)\,dt$ と合わせて、$D_k(s) := 1 + 2\sum_{n=1}^{k} \cos ns$ とおくと、$S_k g(x) = \frac{1}{2\pi}\int_{-\pi}^{\pi} g(t) D_k(x - t)\,dt$ です。$s = x - t$ と置き換えると積分区間は $[x - \pi, x + \pi]$ になりますが、$g(x - s) D_k(s)$ は $s$ について周期 $2\pi$ をもつので、1周期分の積分はどこから始めても同じで、

$$
\begin{aligned}
S_k g(x) &= \frac{1}{2\pi} \int_{-\pi}^{\pi} g(x - s) D_k(s)\,ds \\
\sigma_N g(x) &= \frac{1}{2\pi} \int_{-\pi}^{\pi} g(x - s) F_N(s)\,ds
\end{aligned}
$$

となります。ここで $F_N := (D_0 + D_1 + \dots + D_N)/(N + 1)$ です。

**$F_N$ の形。** $s$ が $2\pi$ の整数倍でないとします。積和の公式 $2 \sin(s/2) \cos ns = \sin\bigl((n + \frac{1}{2})s\bigr) - \sin\bigl((n - \frac{1}{2})s\bigr)$ を $n = 1, \dots, k$ で足して2倍すると、隣どうしが打ち消し合って $2 \sin(s/2) \cdot 2\sum_{n=1}^{k} \cos ns = 2 \sin\bigl((k + \frac{1}{2})s\bigr) - 2 \sin(s/2)$ が残ります。$D_k$ の定数項 1 の分の $2 \sin(s/2)$ を足すと、$2 \sin(s/2)\, D_k(s) = 2 \sin\bigl((k + \frac{1}{2})s\bigr)$ になります。両辺に $\sin(s/2)$ を掛け、積和の公式 $2 \sin(s/2) \sin\bigl((k + \frac{1}{2})s\bigr) = \cos ks - \cos (k + 1)s$ を使って $k = 0, \dots, N$ で足すと、

$$
\begin{aligned}
2 \sin^2\frac{s}{2} \sum_{k=0}^{N} D_k(s) &= \sum_{k=0}^{N} \bigl(\cos ks - \cos (k + 1)s\bigr) \\
&= 1 - \cos (N + 1)s = 2 \sin^2\frac{(N + 1)s}{2}
\end{aligned}
$$

です。したがって

$$
F_N(s) = \frac{1}{N + 1} \cdot \frac{\sin^2\bigl((N + 1)s/2\bigr)}{\sin^2(s/2)}
$$ {#fejer-kernel}

で、$s$ が $2\pi$ の整数倍なら $D_k(s) = 2k + 1$ から $F_N(s) = N + 1$ です。ここから次の三つが分かります。(a) $F_N(s) \ge 0$ です。(b) $n \ge 1$ について $\int_{-\pi}^{\pi} \cos ns\,ds = 0$ なので $\frac{1}{2\pi}\int_{-\pi}^{\pi} D_k(s)\,ds = 1$ で、平均をとっても $\frac{1}{2\pi}\int_{-\pi}^{\pi} F_N(s)\,ds = 1$ です。(c) $0 < \delta < \pi$ とすると、$\delta \le |s| \le \pi$ では $|s|/2$ が $[\delta/2, \pi/2]$ にあり、そこで $\sin$ は増加するので $\sin^2(s/2) \ge \sin^2(\delta/2)$ となり、$F_N(s) \le 1/\bigl((N + 1)\sin^2(\delta/2)\bigr)$ です。

**差を分けて評価する。** (b) から $g(x) = \frac{1}{2\pi}\int_{-\pi}^{\pi} g(x) F_N(s)\,ds$ なので、

$$
\sigma_N g(x) - g(x) = \frac{1}{2\pi} \int_{-\pi}^{\pi} \bigl(g(x - s) - g(x)\bigr) F_N(s)\,ds
$$

です。$\varepsilon > 0$ とします。$g$ は有界閉区間 $[-2\pi, 2\pi]$ で一様連続なので、$0 < \delta < \pi$ を、$|u - v| < \delta$ をみたす $[-2\pi, 2\pi]$ の点 $u, v$ について $|g(u) - g(v)| < \varepsilon$ となるようにとれます。周期性から、この不等式は $|u - v| < \delta$ をみたすすべての実数 $u, v$ で成り立ちます($u$ と $v$ を同じ $2\pi$ の整数倍だけずらして $u \in [-\pi, \pi]$ にすると、$v \in [-2\pi, 2\pi]$ になるからです)。また $M := \max_{t \in [-\pi, \pi]} |g(t)|$ とすると、周期性からすべての実数 $t$ で $|g(t)| \le M$ です。

積分を $|s| < \delta$ の部分と $\delta \le |s| \le \pi$ の部分に分けます。前者では $|g(x - s) - g(x)| < \varepsilon$ なので、(a) と (b) から前者は $\varepsilon$ 以下です。後者では $|g(x - s) - g(x)| \le 2M$ で、(c) から $F_N(s) \le 1/\bigl((N + 1)\sin^2(\delta/2)\bigr)$ なので、後者は $2M/\bigl((N + 1)\sin^2(\delta/2)\bigr)$ 以下です。したがって、すべての実数 $x$ について

$$
|\sigma_N g(x) - g(x)| \le \varepsilon + \frac{2M}{(N + 1)\sin^2(\delta/2)}
$$

です。右辺の第2項は $x$ によらず、$N$ を大きくすれば $\varepsilon$ より小さくなるので、ある $N_0$ があって、すべての $N \ge N_0$ とすべての $x$ で $|\sigma_N g(x) - g(x)| < 2\varepsilon$ となります。$\sigma_N g$ は $g$ に一様収束します。
:::

[[@fejer-kernel]] の $F_N$ をフェイェール核 (Fejér kernel) と呼びます。0 以上で、積分の平均が 1 で、$N$ を大きくすると $s = 0$ の近くに集まっていく関数です。$\sigma_N g(x)$ は、$g$ の $x$ の近くの値を、この重みで平均したものです。

::: theorem {#trig-complete name="三角関数系の完全性"}
三角関数系 [[@trig-system]] は $\mathrm{PC}[-\pi, \pi]$ の完全正規直交系である。したがって、すべての $f \in \mathrm{PC}[-\pi, \pi]$ について $N \to \infty$ で $\|f - S_N f\|_2 \to 0$ となり、[[@parseval-trig]] が成り立つ。
:::

::: proof-sketch
1. $f$ を、とびのある点と両端のまわりの短い区間だけで1次関数に置き換えると、両端の値が等しい連続関数 $g$ で $\|f - g\|_2 < \varepsilon$ となるものができる(区分的に連続な関数は有界である、を使う)。
2. ある $N$ で、すべての $t$ について $|g(t) - \sigma_N g(t)| < \varepsilon/\sqrt{2\pi}$ となり、$\|g - \sigma_N g\|_2 < \varepsilon$(フェイェールの定理と、$\|h\|_2^2 \le 2\pi \sup |h|^2$ を使う)。
3. $\sigma_N g$ は三角関数系の最初の $2N + 1$ 個の線形結合で、$\|f - \sigma_N g\|_2 < 2\varepsilon$(ノルムの三角不等式を使う)。
4. [[@parseval]] の 3 から 1 と 2 が成り立つ(パーセヴァルの等式の定理を使う)。
:::

::: proof
$f \in \mathrm{PC}[-\pi, \pi]$ とし、$-\pi = t_0 < t_1 < \dots < t_k = \pi$ を定義の点、$M$ を $|f|$ の上界とします。$\varepsilon > 0$ とします。

**近似する連続関数を作る。** $\delta > 0$ を、どの区間の長さ $t_j - t_{j-1}$ の半分よりも小さく、$8kM^2\delta < \varepsilon^2$ となるようにとります。$g$ を次のように定めます。各 $j = 1, \dots, k - 1$ について、区間 $[t_j - \delta, t_j + \delta]$ では $g$ を、$f(t_j - \delta)$ と $f(t_j + \delta)$ を結ぶ1次関数にします。$[-\pi, -\pi + \delta]$ では 0 と $f(-\pi + \delta)$ を結ぶ1次関数、$[\pi - \delta, \pi]$ では $f(\pi - \delta)$ と 0 を結ぶ1次関数にします。それ以外の点では $g := f$ とします。$t_j \pm \delta$ は開区間の中の点で $f$ はそこで連続なので、$g$ は $[-\pi, \pi]$ で連続で、$g(-\pi) = g(\pi) = 0$ です。1次関数は両端の値の間の値しかとらないので、$|g| \le M$ です。$f$ と $g$ が違うのは、長さの合計が $2\delta(k - 1) + 2\delta = 2k\delta$ の区間の中だけで、そこでは $|f - g| \le 2M$ なので、

$$
\|f - g\|_2^2 \le (2M)^2 \cdot 2k\delta = 8kM^2\delta < \varepsilon^2
$$

です。

**フェイェールの定理を使う。** $g(-\pi) = g(\pi)$ なので、$g$ を周期 $2\pi$ で実数全体に延ばすと、実数全体で連続になります。[[@fejer]] から、ある $N$ で、すべての $t$ について $|g(t) - \sigma_N g(t)| < \varepsilon/\sqrt{2\pi}$ となります。したがって

$$
\|g - \sigma_N g\|_2^2 = \int_{-\pi}^{\pi} |g(t) - \sigma_N g(t)|^2\,dt < 2\pi \cdot \frac{\varepsilon^2}{2\pi} = \varepsilon^2
$$

です。

**三角多項式で近似できる。** ノルムの三角不等式から $\|f - \sigma_N g\|_2 \le \|f - g\|_2 + \|g - \sigma_N g\|_2 < 2\varepsilon$ です。$\sigma_N g$ は $S_0 g, \dots, S_N g$ の平均なので、$1, \cos t, \sin t, \dots, \cos Nt, \sin Nt$ の線形結合、つまり三角関数系の最初の $2N + 1$ 個の線形結合です。

**結論。** $\varepsilon > 0$ はいくらでも小さくとれるので、$f$ は [[@parseval]] の 3 をみたします。したがって $f$ は三角関数系による展開の級数の和に等しく、パーセヴァルの等式が成り立ちます。$f$ は $\mathrm{PC}[-\pi, \pi]$ のどの関数でもよいので、三角関数系は完全です。$S_N f$ はこの級数の第 $2N + 1$ 部分和なので $\|f - S_N f\|_2 \to 0$ で、パーセヴァルの等式を $a_n, b_n$ で書いたものが [[@parseval-trig]] です。
:::

::: examples
**方形波。** [[@convergence-metric]] の方形波 $f$($-\pi < t < 0$ で $-1$、$0 < t < \pi$ で $1$、$t = 0, \pm\pi$ で 0)は奇関数なので $a_n = 0$ で、

$$
b_n = \frac{2}{\pi} \int_0^{\pi} \sin nt\,dt = \frac{2}{n\pi}(1 - \cos n\pi) = \begin{cases} \dfrac{4}{n\pi} & (n \text{ が奇数}) \\ 0 & (n \text{ が偶数}) \end{cases}
$$

です。$\frac{1}{\pi}\int_{-\pi}^{\pi} f(t)^2\,dt = 2$ なので、[[@parseval-trig]] は $2 = \sum_{n \text{ 奇数}} 16/(n^2\pi^2)$、つまり

$$
1 + \frac{1}{3^2} + \frac{1}{5^2} + \dots = \frac{\pi^2}{8}
$$

です。偶数番目だけを足した $\sum 1/(2m)^2$ は全体の $1/4$ なので、奇数番目の和は全体の $3/4$ で、$\sum_{n=1}^{\infty} 1/n^2 = (4/3)(\pi^2/8) = \pi^2/6$ も分かります。

2乗誤差は、[[@best-approximation]] の 2 とパーセヴァルの等式から、$\|f - S_N f\|_2^2 = \pi \sum_{n > N,\ n \text{ 奇数}} b_n^2 = \frac{16}{\pi}\sum_{n > N,\ n \text{ 奇数}} \frac{1}{n^2}$ です。$\|f\|_2^2 = 2\pi \approx 6.283$ に対して、$N = 1$ で約 $1.190$、$N = 9$ で約 $0.254$、$N = 99$ で約 $0.0255$ と、0 に近づきます。一方、[[@convergence-metric]] で見たとおり、$0 < t < \pi$ での $S_N f$ の最大値は 1 を約 $0.179$ 上回ったままで、$d_\infty(S_N f, f)$ は 0 に近づきません。2乗誤差で測れば収束し、sup 距離で測れば収束しない、という二つの事実が並んでいます。

**完全でない例。** $\sin nt/\sqrt{\pi}$($n = 1, 2, \dots$)だけの列は、$\mathrm{PC}[-\pi, \pi]$ の正規直交系ですが、完全ではありません。$\cos t$ はどの $\sin nt$ とも直交するので、この列に関するフーリエ係数はすべて 0 なのに、$\|\cos t\|_2^2 = \pi$ だからです。
:::

::: pitfall
**2乗誤差で収束しても、各点で収束するとは限らない。** [[@trig-complete]] が保証するのは $\|f - S_N f\|_2 \to 0$ だけで、各点 $t$ で $S_N f(t) \to f(t)$ となることではありません。積分は1点での値を区別しないので、$f$ の値を1点だけ変えても、フーリエ係数は変わりません。連続関数でも、フーリエ級数がある点で収束しない例があることが知られています(デュ・ボワ=レーモンが作りました)。[[@convergence-metric]] の方形波が不連続点以外の各点で収束するのは、区分的に滑らかな関数についての別の定理(ディリクレの定理)によるものです。

**係数の書き方は本によって違う。** この駅の $a_n$、$b_n$ は $\frac{1}{\pi}\int$ で定め、三角関数系に関するフーリエ係数とは $\sqrt{\pi}$ 倍だけ違います。$[0, 2\pi]$ 上で考える本、周期を $2\pi$ 以外の $T$ にとる本、複素数の $e^{int}$ を使って係数を $\frac{1}{2\pi}\int_{-\pi}^{\pi} f(t) e^{-int}\,dt$ と定める本もあります。パーセヴァルの等式の係数(この駅の $\frac{1}{\pi}$ と $\frac{a_0^2}{2}$)も、それに合わせて変わります。
:::

::: drop-assumption
**とびのある点での値の約束を外す。** [[@convergence-metric]] の方形波 $f$ の、$t = 0$ での値だけを 1 に変えた関数を $\tilde{f}$ とします。$\tilde{f}$ は区分的に連続ですが、$t = 0$ の値が左右の極限の平均 0 ではないので、$\mathrm{PC}[-\pi, \pi]$ には入りません。積分は1点の値を区別しないので、$\tilde{f}$ のフーリエ係数は $f$ と同じで、$\int_{-\pi}^{\pi} (\tilde{f} - f)^2\,dt = 0$ なのに $\tilde{f} \ne f$ です。こうした関数も認めると、$\langle \cdot, \cdot \rangle$ は正値性をみたさず内積ではなくなり、$\|S_N f - \tilde{f}\|_2 = \|S_N f - f\|_2 \to 0$ なので、部分和は $f$ にも $\tilde{f}$ にも「収束」してしまいます。[[@normed-space]] の「仮定を外すと」で見た、正値性を欠く距離と同じで、極限がただ一つに決まりません。
:::

::: application {field=physics title="箱の中の粒子と確率の和"}
幅 $L$ の箱の中の粒子のエネルギー固有関数 $u_n(x) = \sqrt{2/L}\,\sin(n\pi x/L)$ が完全正規直交系であることを、[[@trig-complete]] から導きます。状態は、$[0, L]$ 上の区分的に連続な関数で、とびのある点では両側の極限の平均をとり、両端で 0 になるものとします。

状態 $\psi$ について、変数を $\pi/L$ 倍に縮めて奇関数に延ばした $\varphi(t) := \psi(Lt/\pi)$($0 \le t \le \pi$)、$\varphi(t) := -\psi(-Lt/\pi)$($-\pi \le t < 0$)を考えます。$t = 0$ と $t = \pm\pi$ での値はどちらも 0 で、両側の極限の平均になっているので、$\varphi \in \mathrm{PC}[-\pi, \pi]$ です。$\varphi$ は奇関数なので $a_n = 0$ で、$x = Lt/\pi$ と置き換えると、$c_n := \langle \psi, u_n \rangle$ について

$$
b_n = \frac{2}{\pi} \int_0^{\pi} \varphi(t) \sin nt\,dt = \frac{2}{L} \int_0^{L} \psi(x) \sin\frac{n\pi x}{L}\,dx = \sqrt{\frac{2}{L}}\, c_n
$$

です。同じ置き換えで $\frac{1}{\pi}\int_{-\pi}^{\pi} \varphi(t)^2\,dt = \frac{2}{L}\int_0^L \psi(x)^2\,dx$ なので、[[@parseval-trig]] は $\frac{2}{L}\|\psi\|_2^2 = \frac{2}{L}\sum_{n=1}^{\infty} c_n^2$、つまり

$$
\|\psi\|_2^2 = \sum_{n=1}^{\infty} c_n^2
$$

となります。すべての状態でパーセヴァルの等式が成り立つので、[[@parseval]] から $(u_n)$ は完全です。規格化された状態では、各準位の確率 $c_n^2$ の和はちょうど 1 です。

[[@norm-inner-product]] で例にした $\psi(x) = \sqrt{30/L^5}\, x(L - x)$ では、奇数の $n$ で $c_n = 8\sqrt{15}/(n\pi)^3$、偶数の $n$ で $c_n = 0$ だったので、

$$
\begin{gathered}
\sum_{n \text{ 奇数}} \frac{960}{\pi^6 n^6} = 1 \\
1 + \frac{1}{3^6} + \frac{1}{5^6} + \dots = \frac{\pi^6}{960} \approx 1.00145
\end{gathered}
$$

です。2行目は、1行目の両辺に $\pi^6/960$ を掛けたものです。最初の2項の確率の和は約 $0.99992$ だったので、$n \ge 5$ の準位すべてを合わせた確率は約 $0.00008$ です。[[@completeness-fixed-point]] の理論物理の応用の $\chi$ についても、同じ理由で展開の部分和が $L^2$ 距離で $\chi$ に収束し、各準位の確率の和はちょうど 1 になります。
:::

::: application {field=cs title="信号の圧縮と捨てた係数"}
周期 $2\pi$ の信号 $f$ を、フーリエ係数のうちいくつかだけを残し、残りを 0 にした三角多項式 $g$ で置き換えることを考えます。$f - g$ のフーリエ係数は、捨てた係数そのもの(残した番号では 0)なので、[[@trig-complete]] から $f - g$ にもパーセヴァルの等式が使えて、

$$
\frac{1}{\pi}\|f - g\|_2^2 = (\text{捨てた } a_n, b_n \text{ の2乗の和})
$$

となります($a_0$ を捨てたときは、その項を $a_0^2/2$ として数えます)。誤差の2乗は、捨てた係数の大きさだけで決まります。

方形波では $\frac{1}{\pi}\|f\|_2^2 = 2 = \sum_{n \text{ 奇数}} 16/(n^2\pi^2)$ です。$b_1, b_3, b_5$ の3個だけを残すと、残した係数の2乗の和は $\frac{16}{\pi^2}(1 + \frac{1}{9} + \frac{1}{25}) \approx 1.866$ で、全体の 2 の約 93.3% です。誤差の2乗は、$\|f\|_2^2$ の約 6.7% です。$n \le 19$ の奇数の10個を残すと、誤差の2乗は約 2.0% になります。

JPEG などの画像圧縮では、三角関数の仲間である離散コサイン変換 (discrete cosine transform) で画像の小さなブロックを係数に分け、細かい模様に当たる係数を粗く丸めます。この変換も正規直交系による展開なので、係数の丸めによる誤差の2乗の和は、画素の値の誤差の2乗の和に等しくなります。
:::

## ヒルベルト空間 {#hilbert-space requires=orthonormal-system,completeness}

::: summary
内積から決まる距離について完備な内積空間で、2乗の和が有限な係数をもつ直交展開が必ず収束するもの。
:::

::: why
[[@trig-complete]] から、$\mathrm{PC}[-\pi, \pi]$ のどの関数も、三角関数系に関するフーリエ係数で決まり、係数の2乗の和は有限です。では逆に、2乗の和が有限な実数列 $(c_n)$ を勝手に決めたとき、それをフーリエ係数にもつ関数はあるでしょうか。部分和 $s_N = \sum_{n=1}^{N} c_n e_n$ は、[[@orthonormal-length]] から $M < N$ なら $\|s_N - s_M\|^2 = \sum_{n=M+1}^{N} c_n^2$ をみたすので、[[コーシー列]]です。しかし $\mathrm{PC}[-\pi, \pi]$ は完備ではなく(下の例)、コーシー列の行き先が空間の中にあるとは限りません。[[@completeness-fixed-point]] で見た、$\mathbb{Q}$ に穴があるのと同じ状況です。係数の列がいつもベクトルを決めるようにするには、空間が[[completeness|完備]]であることが要ります。
:::

::: definition {name="ヒルベルト空間" en="Hilbert space"}
内積空間 $(V, \langle \cdot, \cdot \rangle)$ が、内積から決まるノルム $\|x\| = \sqrt{\langle x, x \rangle}$ の距離 $d(x, y) = \|x - y\|$ について[[completeness|完備]]であるとき、$V$ をヒルベルト空間という。
:::

内積から決まるノルムをもつ[[バナッハ空間]]、と言っても同じです^[無限次元のものや、可分(下の補足)なものだけをヒルベルト空間と呼ぶ本もあります。]。$\mathbb{R}^m$ に標準内積を入れた空間は、[[@normed-space]] で見たとおり完備なので、ヒルベルト空間です。無限次元の代表例は、次の数列の空間です。

::: definition {#l2 name="2乗総和可能な数列の空間" en="space of square-summable sequences"}
実数列 $x = (x_n)_{n \ge 1}$ で、級数 $\sum_{n=1}^{\infty} x_n^2$ が収束するものの全体を $\ell^2$ と書く。$\ell^2$ には、項ごとの足し算と実数倍と、内積 $\langle x, y \rangle := \sum_{n=1}^{\infty} x_n y_n$ を入れる。
:::

$\ell^2$ が実際に内積空間であることを確かめます。$x, y \in \ell^2$ なら、$(x_n + y_n)^2 \le 2x_n^2 + 2y_n^2$ なので、部分和が上に有界な単調増加列になり、$x + y \in \ell^2$ です。実数倍についても同じで、$\ell^2$ はベクトル空間です。内積を定める級数は、$x_n y_n = \frac{1}{4}\bigl((x_n + y_n)^2 - (x_n - y_n)^2\bigr)$ と書くと、収束する二つの級数の差なので、収束します。対称性と線形性は項ごとに確かめられ、$\langle x, x \rangle = \sum x_n^2 = 0$ ならすべての $x_n$ が 0 です。$n$ 番目だけが 1 でほかが 0 の数列を $e_n$ とすると、$(e_n)$ は $\ell^2$ の正規直交系で、$x$ の $e_n$ に関するフーリエ係数は $x_n$ です。$\|x - \sum_{n=1}^{N} x_n e_n\|^2 = \sum_{n > N} x_n^2 \to 0$ なので、$(e_n)$ は完全です。

::: theorem {#l2-complete name="数列の空間の完備性"}
$\ell^2$ はヒルベルト空間である。
:::

::: proof-sketch
1. $(x^{(k)})$ を $\ell^2$ のコーシー列とすると、$|x^{(k)}_n - x^{(j)}_n| \le \|x^{(k)} - x^{(j)}\|$ なので、各 $n$ で $(x^{(k)}_n)_k$ は $\mathbb{R}$ のコーシー列で、極限 $x_n$ がある($\mathbb{R}$ の完備性を使う)。
2. $k, j \ge K$ なら各 $N$ で $\sum_{n=1}^{N} (x^{(k)}_n - x^{(j)}_n)^2 < \varepsilon^2$ で、$j \to \infty$ とすると $\sum_{n=1}^{N} (x^{(k)}_n - x_n)^2 \le \varepsilon^2$(極限をとっても $\le$ は保たれる、を使う)。
3. $N$ は何でもよいので、$x^{(k)} - x \in \ell^2$ で $\|x^{(k)} - x\| \le \varepsilon$。$x = x^{(k)} - (x^{(k)} - x) \in \ell^2$(上に有界な単調増加列は収束する、と、$\ell^2$ がベクトル空間であることを使う)。
4. すべての $k \ge K$ で $\|x^{(k)} - x\| \le \varepsilon$ なので、$x^{(k)}$ は $x$ に収束する(収束の定義を使う)。
:::

::: proof
$(x^{(k)})_{k \ge 1}$ を $\ell^2$ のコーシー列とします。各 $n$ で $|x^{(k)}_n - x^{(j)}_n| \le \|x^{(k)} - x^{(j)}\|$ なので、$(x^{(k)}_n)_{k \ge 1}$ は $\mathbb{R}$ のコーシー列です。$\mathbb{R}$ は完備なので、極限 $x_n := \lim_{k \to \infty} x^{(k)}_n$ があります。$x := (x_n)_{n \ge 1}$ とおきます。

$\varepsilon > 0$ とし、すべての $k, j \ge K$ で $\|x^{(k)} - x^{(j)}\| < \varepsilon$ となる $K$ をとります。$k \ge K$ と正の整数 $N$ を固定すると、すべての $j \ge K$ で

$$
\sum_{n=1}^{N} \bigl(x^{(k)}_n - x^{(j)}_n\bigr)^2 \le \|x^{(k)} - x^{(j)}\|^2 < \varepsilon^2
$$

です。左辺は有限個の項の和なので、$j \to \infty$ とすると $\sum_{n=1}^{N} (x^{(k)}_n - x_n)^2 \le \varepsilon^2$ となります。これがすべての $N$ で成り立つので、$\sum_{n} (x^{(k)}_n - x_n)^2$ の部分和は上に有界な単調増加列で、収束し、その和は $\varepsilon^2$ 以下です。つまり $x^{(k)} - x \in \ell^2$ で $\|x^{(k)} - x\| \le \varepsilon$ です。$\ell^2$ はベクトル空間なので、$x = x^{(k)} - (x^{(k)} - x) \in \ell^2$ です。すべての $k \ge K$ で $\|x^{(k)} - x\| \le \varepsilon$ なので、$x^{(k)}$ は $x$ に収束します。
:::

ヒルベルト空間では、2乗の和が有限な係数をもつ直交展開が、必ず収束します。

::: theorem {#orthonormal-series name="正規直交系の級数の収束"}
$V$ をヒルベルト空間、$(e_n)_{n \ge 1}$ を $V$ の正規直交系とする。実数列 $(c_n)$ について、級数 $\sum_{n=1}^{\infty} c_n e_n$ が収束するための必要十分条件は、$\sum_{n=1}^{\infty} c_n^2$ が収束することである。このとき $x := \sum_{n=1}^{\infty} c_n e_n$ について、すべての $n$ で $\langle x, e_n \rangle = c_n$ であり、$\|x\|^2 = \sum_{n=1}^{\infty} c_n^2$ である。
:::

::: proof-sketch
1. 部分和 $s_N := \sum_{n=1}^{N} c_n e_n$ は、$M < N$ なら $\|s_N - s_M\|^2 = \sum_{n=M+1}^{N} c_n^2$ をみたす([[@orthonormal-length]] を使う)。
2. $\sum c_n^2$ が収束すれば、1 の右辺はいくらでも小さくなり、$(s_N)$ はコーシー列なので収束する($V$ の完備性を使う)。
3. 逆に $s_N \to x$ なら、$\|s_N\|^2 = \sum_{n=1}^{N} c_n^2$ は $\|x\|^2$ に収束する(三角不等式から導く $|\|s_N\| - \|x\|| \le \|s_N - x\|$ を使う)。
4. $\langle x, e_m \rangle = \lim_{N \to \infty} \langle s_N, e_m \rangle = c_m$(コーシー=シュワルツの不等式 $|\langle s_N - x, e_m \rangle| \le \|s_N - x\|$ を使う)。
:::

::: proof
$s_N := \sum_{n=1}^{N} c_n e_n$ とおきます。$M < N$ なら $s_N - s_M = \sum_{n=M+1}^{N} c_n e_n$ なので、[[@orthonormal-length]] から $\|s_N - s_M\|^2 = \sum_{n=M+1}^{N} c_n^2$ です。

**$\sum c_n^2$ が収束するとき。** 部分和 $T_N := \sum_{n=1}^{N} c_n^2$ は収束するので、$\mathbb{R}$ のコーシー列です。したがって、どんな $\varepsilon > 0$ についてもある $K$ があって、$K \le M < N$ なら $\|s_N - s_M\|^2 = T_N - T_M < \varepsilon^2$ となり、$(s_N)$は $V$ のコーシー列です。$V$ は完備なので、$(s_N)$ はある $x \in V$ に収束します。

**$(s_N)$ が収束するとき。** $s_N \to x$ とします。ノルムの三角不等式から $\|s_N\| \le \|s_N - x\| + \|x\|$ と $\|x\| \le \|x - s_N\| + \|s_N\|$ なので、$\bigl|\|s_N\| - \|x\|\bigr| \le \|s_N - x\| \to 0$ です。[[@orthonormal-length]] から $\|s_N\|^2 = \sum_{n=1}^{N} c_n^2$ なので、$\sum c_n^2$ は収束し、和は $\|x\|^2$ です。

**係数。** $N \ge m$ なら $\langle s_N, e_m \rangle = c_m$ です。[[@cauchy-schwarz]] から $|\langle x, e_m \rangle - c_m| = |\langle x - s_N, e_m \rangle| \le \|x - s_N\|\,\|e_m\| = \|x - s_N\| \to 0$ なので、$\langle x, e_m \rangle = c_m$ です。
:::

完全正規直交系をもつ内積空間では、この性質がちょうど完備性の言い換えになっています。

::: theorem {#completeness-coefficients name="完備性と係数の列"}
$V$ を内積空間とし、$(e_n)_{n \ge 1}$ を $V$ の完全正規直交系とする。$V$ がヒルベルト空間であるための必要十分条件は、$\sum_{n=1}^{\infty} c_n^2$ が収束するどんな実数列 $(c_n)$ についても、すべての $n$ で $\langle x, e_n \rangle = c_n$ となる $x \in V$ があることである。
:::

::: proof-sketch
1. $V$ がヒルベルト空間なら、$x := \sum c_n e_n$ が求めるベクトル([[@orthonormal-series]] を使う)。
2. 逆を示す。$(x_k)$ を $V$ のコーシー列とすると、フーリエ係数の列 $c^{(k)} := (\langle x_k, e_n \rangle)_{n \ge 1}$ は $\ell^2$ の点で、$\|c^{(k)} - c^{(j)}\| = \|x_k - x_j\|$ なので、$\ell^2$ のコーシー列(パーセヴァルの等式を $x_k - x_j$ に使う)。
3. $\ell^2$ は完備なので $c^{(k)}$ はある $c \in \ell^2$ に収束し、仮定から $c$ をフーリエ係数にもつ $x \in V$ がある([[@l2-complete]] を使う)。
4. $\|x_k - x\| = \|c^{(k)} - c\| \to 0$ なので、$V$ は完備(パーセヴァルの等式を $x_k - x$ に使う)。
:::

::: proof
**ヒルベルト空間なら。** $\sum c_n^2$ が収束するとき、[[@orthonormal-series]] から $x := \sum_{n=1}^{\infty} c_n e_n$ は収束し、すべての $n$ で $\langle x, e_n \rangle = c_n$ です。

**係数の列がいつもベクトルを決めるなら。** $(x_k)_{k \ge 1}$ を $V$ のコーシー列とし、$c^{(k)} := (\langle x_k, e_n \rangle)_{n \ge 1}$ とおきます。$(e_n)$ は完全なので、[[@parseval]] から $\sum_n \langle x_k, e_n \rangle^2 = \|x_k\|^2$ で、$c^{(k)} \in \ell^2$ です。内積の線形性から $x_k - x_j$ のフーリエ係数の列は $c^{(k)} - c^{(j)}$ なので、$x_k - x_j$ にパーセヴァルの等式を使うと

$$
\|c^{(k)} - c^{(j)}\|^2 = \sum_{n=1}^{\infty} \langle x_k - x_j, e_n \rangle^2 = \|x_k - x_j\|^2
$$

です。したがって $(c^{(k)})$ は $\ell^2$ のコーシー列で、[[@l2-complete]] からある $c \in \ell^2$ に収束します。仮定から、すべての $n$ で $\langle x, e_n \rangle = c_n$ となる $x \in V$ があります。$x_k - x$ のフーリエ係数の列は $c^{(k)} - c$ なので、同じくパーセヴァルの等式から $\|x_k - x\| = \|c^{(k)} - c\| \to 0$ です。$V$ のコーシー列はすべて収束するので、$V$ は完備です。
:::

ヒルベルト空間 $V$ が完全正規直交系 $(e_n)$ をもてば、$x$ にフーリエ係数の列 $(\langle x, e_n \rangle)_{n \ge 1}$ を対応させる写像は、$V$ から $\ell^2$ への[[bijection|全単射]]です。[[@completeness-coefficients]] から全射で、パーセヴァルの等式から、フーリエ係数がすべて等しい二つのベクトルは差のノルムが 0 なので単射です。さらに、パーセヴァルの等式から長さを保ち、$\langle x, y \rangle = \frac{1}{4}(\|x + y\|^2 - \|x - y\|^2)$ から内積も保ちます。この意味で、そうしたヒルベルト空間は、どれも $\ell^2$ と同じ形をしています。

::: examples
- ヒルベルト空間である例:標準内積を入れた $\mathbb{R}^m$ と、$\ell^2$([[@l2-complete]])。
- ヒルベルト空間でない例:内積 $\int_{-1}^{1} f(t) g(t)\,dt$ を入れた $C[-1, 1]$。[[@norm-inner-product]] の落とし穴で見たとおり、階段関数に近づくコーシー列が行き先をもちません。
- $\mathrm{PC}[-\pi, \pi]$ もヒルベルト空間ではありません。とびを許しても、上限なく大きくなる関数は入らないからです。
:::

$\mathrm{PC}[-\pi, \pi]$ が完備でないことを確かめます。正の整数 $n$ について、$f_n(t) := n$($|t| \le n^{-4}$)、$f_n(t) := |t|^{-1/4}$($n^{-4} \le |t| \le \pi$)と定めます。$f_n$ は連続で両端の値が等しいので、$\mathrm{PC}[-\pi, \pi]$ に入ります。$m > n$ なら、$f_m$ と $f_n$ が違うのは $|t| < n^{-4}$ の範囲だけで、そこでは $0 \le f_m - f_n \le f_m$ なので、

$$
\begin{aligned}
\|f_m - f_n\|_2^2 &\le \int_{-n^{-4}}^{n^{-4}} f_m(t)^2\,dt \\
&= 2\left( \int_0^{m^{-4}} m^2\,dt + \int_{m^{-4}}^{n^{-4}} t^{-1/2}\,dt \right) \\
&= \frac{4}{n^2} - \frac{2}{m^2} < \frac{4}{n^2}
\end{aligned}
$$

となり、$(f_n)$ はコーシー列です。ある $g \in \mathrm{PC}[-\pi, \pi]$ に収束したとすると、$0 < \delta < \pi$ について、$n \ge \delta^{-1/4}$ なら $\delta \le |t| \le \pi$ で $f_n(t) = |t|^{-1/4}$ なので、

$$
\int_{\delta \le |t| \le \pi} \bigl(|t|^{-1/4} - g(t)\bigr)^2\,dt \le \|f_n - g\|_2^2 \to 0
$$

で、左辺は 0 です。$\mathrm{PC}[-\pi, \pi]$ の内積の正値性と同じ議論から、$\delta \le |t| \le \pi$ のうち $g$ が連続な点、つまり有限個を除くすべての点で $g(t) = |t|^{-1/4}$ です。$\delta$ はいくらでも小さくとれるので、$g$ は 0 の近くでいくらでも大きな値をとり、有界になりません。区分的に連続な関数は有界なので、これは矛盾です。

三角関数系は $\mathrm{PC}[-\pi, \pi]$ の完全正規直交系なので([[@trig-complete]])、[[@completeness-coefficients]] から、2乗の和は有限なのに、それをフーリエ係数にもつ関数が $\mathrm{PC}[-\pi, \pi]$ にない係数の列があることになります。

::: remark
**完備にした空間。** $\mathrm{PC}[-\pi, \pi]$ に、コーシー列の行き先を付け加えて完備にした空間を $L^2[-\pi, \pi]$ と書き、三角関数系はそのヒルベルト空間の完全正規直交系になります。[[@completeness-fixed-point]] の理論物理の応用で触れた量子力学の状態空間 $L^2$ は、これと同じ作り方の空間です。$L^2$ の元を関数として扱うにはルベーグ積分が要るので、この章では扱いません。

**複素数の場合。** 量子力学では、複素数を係数とする内積空間を使います([[@norm-inner-product]] の落とし穴)。この章の定義と定理は、フーリエ係数の2乗 $\langle x, e_n \rangle^2$ を絶対値の2乗 $|\langle x, e_n \rangle|^2$ に、$\ell^2$ を2乗の絶対値の和が有限な複素数列の空間に替えれば、同じ証明で成り立ちます。内積が2番目の引数について線形という約束では、フーリエ係数を $\langle e_n, x \rangle$ と書きます。

**番号の付いた正規直交系。** この章では、正規直交系を番号の付いた列に限りました。番号の付いた列で完全正規直交系がとれるヒルベルト空間を、可分 (separable) であるといいます。量子力学で使う状態空間は、可分なものです。
:::

::: pitfall
**完全正規直交系があっても、完備とは限らない。** $\mathrm{PC}[-\pi, \pi]$ では三角関数系が完全で、すべての関数がフーリエ級数で表せます。それでも空間は完備ではありません。完全であることは、空間の中のベクトルが展開で表せることを言い、完備であることは、展開の係数の側から見て、どんな係数の列にもベクトルがあることを言います。

**有限個で打ち切った近似は、空間の外に出ない。** 完備でない空間でも、有限個の項の和 $\sum_{n=1}^{N} c_n e_n$ はいつも空間の中にあります。完備性が要るのは、無限個の項の和の行き先を考えるときだけです。数値計算で展開を有限個で打ち切るときに、完備性を気にしなくてよいのはこのためです。
:::

::: drop-assumption
**[[@orthonormal-series]] で、空間の完備性を外す。** 有限個の項を除いて 0 の実数列の全体を $c_{00}$ とし、$\ell^2$ と同じ内積を入れます。$n$ 番目だけが 1 の数列 $e_n$ は $c_{00}$ の正規直交系で、$c_{00}$ のどの元も有限個の $e_n$ の線形結合なので、完全です。$c_n = 1/n$ とすると $\sum c_n^2$ は収束しますが、級数 $\sum c_n e_n$ は $c_{00}$ の中で収束しません。もしある $y \in c_{00}$ に収束したとすると、[[@orthonormal-series]] の証明の「係数」の部分と同じ議論から、すべての $m$ で $\langle y, e_m \rangle = 1/m \ne 0$ となり、$y$ の 0 でない項が無限個あることになってしまうからです。部分和はコーシー列ですが、行き先(項がすべて 0 でない数列 $(1/n)$)は $c_{00}$ の外の $\ell^2$ にあります。
:::

::: application {field=physics title="量子力学の状態空間"}
量子力学では、粒子の状態を、ヒルベルト空間の長さ 1 のベクトルで表します。ここでは幅 $L$ の箱の中の粒子で、状態空間が完備であることがどこで効くかを見ます。時間発展の係数は複素数になるので、上の補足のとおり、複素数の場合の定理を使います。

[[@fourier-series]] の理論物理の応用から、エネルギー固有関数 $u_n(x) = \sqrt{2/L}\,\sin(n\pi x/L)$ は完全正規直交系で、状態 $\psi$ は展開係数の列 $(c_n)$ で決まり、$\sum |c_n|^2 = \|\psi\|^2 = 1$ です。[[@completeness-coefficients]] から、状態空間がヒルベルト空間であることは、2乗の和が 1 になるどんな係数の列についても、その係数をもつ状態があることと同じです。状態を係数の列で表すことは、状態空間を $\ell^2$ と同じものとして扱うことにあたります。

時刻 0 の状態が $\psi = \sum c_n u_n$ なら、時刻 $t$ の状態は、シュレーディンガー方程式から

$$
\psi_t = \sum_{n=1}^{\infty} c_n e^{-iE_n t/\hbar} u_n, \qquad E_n = \frac{n^2 \pi^2 \hbar^2}{2mL^2}
$$

です($m$ は粒子の質量、$\hbar$ はプランク定数を $2\pi$ で割った数)。$|c_n e^{-iE_n t/\hbar}| = |c_n|$ なので係数の2乗の和は 1 のままで、[[@orthonormal-series]] からこの級数は収束し、$\|\psi_t\| = 1$ です。一般の時刻の $\psi_t$ が閉じた式で書けるとは限りませんが、ヒルベルト空間の中には必ずあります。

特別な時刻では、式で書けます。$T := 4mL^2/(\pi\hbar)$ とおくと $E_n T/\hbar = 2\pi n^2$ なので、$\psi_T = \psi$ で、状態は元に戻ります。$T/2$ では $e^{-iE_n T/(2\hbar)} = e^{-i\pi n^2} = (-1)^n$($n^2$ と $n$ の偶奇は同じ)で、係数は $(-1)^n c_n$ です。一方、$u_n(L - x) = (-1)^{n+1} u_n(x)$ を使うと、左右を反転した $-\psi(L - x)$ のフーリエ係数も $(-1)^n c_n$ になります。フーリエ係数で状態が決まるので、$\psi_{T/2}(x) = -\psi(L - x)$ です。[[@completeness-fixed-point]] の $\chi$(左半分にいる状態)から始めると、時刻 $T/2$ には粒子は確率 1 で右半分にいます。幅 $L = 1\,\mathrm{nm}$ の箱の中の電子では、$T = 4mL^2/(\pi\hbar) \approx 1.1 \times 10^{-14}\,\mathrm{s}$ です。
:::

::: review
- 正規直交系について、フーリエ係数を内積で求め、有限個で打ち切ったときの誤差を計算できる。
- 最良近似の性質とベッセルの不等式を証明できる。
- 完全正規直交系の定義を述べ、パーセヴァルの等式との関係を説明できる。
- フーリエ係数を計算し、パーセヴァルの等式から級数の和を求められる。
- 三角関数系が完全であることの証明の流れ(連続関数による近似とフェイェールの定理)を説明できる。
- ヒルベルト空間の例と、完備でない内積空間の例を挙げられる。
- 正規直交系が完全であることと、空間が完備であることの違いを説明できる。
:::

::: question
$\mathbb{R}^3$ の標準内積で、$e_1 = (1, 1, 0)/\sqrt{2}$、$e_2 = (1, -1, 0)/\sqrt{2}$ とします。$x = (3, 1, 2)$ のフーリエ係数 $c_1, c_2$、最良近似 $s_2 = c_1 e_1 + c_2 e_2$、誤差の2乗 $\|x - s_2\|^2$ を求め、最良近似の定理の 2 と、ベッセルの不等式が成り立っていることを確かめてください。
:::

::: answer
$c_1 = \langle x, e_1 \rangle = 4/\sqrt{2} = 2\sqrt{2}$、$c_2 = \langle x, e_2 \rangle = 2/\sqrt{2} = \sqrt{2}$ です。$s_2 = 2(1, 1, 0) + (1, -1, 0) = (3, 1, 0)$ で、$x - s_2 = (0, 0, 2)$ なので $\|x - s_2\|^2 = 4$ です。$\|x\|^2 = 9 + 1 + 4 = 14$、$c_1^2 + c_2^2 = 8 + 2 = 10$ なので、$\|x\|^2 - (c_1^2 + c_2^2) = 4$ となり、最良近似の定理の 2 と一致します。$10 \le 14$ で、ベッセルの不等式も成り立っています。誤差 $(0, 0, 2)$ は $e_1$ とも $e_2$ とも直交しています。
:::

::: question
$f(t) = t$($-\pi < t < \pi$)、$f(\pm\pi) = 0$ と定めます。$f \in \mathrm{PC}[-\pi, \pi]$ であることを確かめ、フーリエ係数 $a_n, b_n$ を求めてください。さらに、パーセヴァルの等式から $\sum_{n=1}^{\infty} 1/n^2$ を求めてください。
:::

::: answer
$f$ は $(-\pi, \pi)$ で連続で、$f(-\pi + 0) = -\pi$、$f(\pi - 0) = \pi$ なので、両端の値 0 はその平均です。したがって $f \in \mathrm{PC}[-\pi, \pi]$ です。$f$ は奇関数なので $a_n = 0$ です。部分積分から

$$
\begin{aligned}
\int_{-\pi}^{\pi} t \sin nt\,dt &= 2\int_0^{\pi} t \sin nt\,dt \\
&= 2\left[-\frac{t \cos nt}{n}\right]_0^{\pi} + \frac{2}{n}\int_0^{\pi} \cos nt\,dt \\
&= -\frac{2\pi (-1)^n}{n}
\end{aligned}
$$

なので、$b_n = 2(-1)^{n+1}/n$ です。$\frac{1}{\pi}\int_{-\pi}^{\pi} t^2\,dt = \frac{2\pi^2}{3}$ なので、パーセヴァルの等式は $\frac{2\pi^2}{3} = \sum_{n=1}^{\infty} \frac{4}{n^2}$ となり、$\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6$ です。方形波から求めた値と一致します。
:::

::: question
$\sin nt/\sqrt{\pi}$($n = 1, 2, \dots$)だけからなる列は、$\mathrm{PC}[-\pi, \pi]$ の完全正規直交系ですか。
:::

::: answer
いいえ。$\cos t \in \mathrm{PC}[-\pi, \pi]$ はどの $\sin nt$ とも直交するので、この列に関するフーリエ係数はすべて 0 で、2乗の和は 0 です。一方 $\|\cos t\|_2^2 = \pi \ne 0$ なので、パーセヴァルの等式が成り立たず、完全ではありません。
:::

::: question
$V$ をヒルベルト空間、$(e_n)_{n \ge 1}$ を $V$ の正規直交系とします。級数 $\sum_{n=1}^{\infty} e_n/n$ と $\sum_{n=1}^{\infty} e_n/\sqrt{n}$ は収束しますか。収束するなら、和の長さの2乗も求めてください。
:::

::: answer
[[@orthonormal-series]] から、$\sum c_n e_n$ が収束するのは $\sum c_n^2$ が収束するときだけです。$\sum 1/n^2$ は収束するので $\sum e_n/n$ は収束し、和を $x$ とすると、$f(t) = t$ の問の結果から $\|x\|^2 = \sum 1/n^2 = \pi^2/6$ です。$\sum (1/\sqrt{n})^2 = \sum 1/n$ は発散するので、$\sum e_n/\sqrt{n}$ は収束しません。部分和の長さの2乗 $\sum_{n=1}^{N} 1/n$ がいくらでも大きくなり、収束する列は有界であることに反するからです。
:::
