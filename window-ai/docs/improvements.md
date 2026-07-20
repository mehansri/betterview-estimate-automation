# Review of Window Price Driver Analysis

## Overall Assessment

Overall, this is an excellent first iteration. It goes beyond simply training a machine learning model and begins identifying the actual pricing logic used by the manufacturer. The report provides valuable insight into which variables drive price and can serve as a strong foundation for building a production-grade quoting engine.

However, I would **not** use this report as the final pricing engine. Instead, I would treat it as exploratory data analysis (EDA) that informs how the pricing engine should be built.

---

# Overall Rating

| Category | Score |
|----------|------:|
| Data Cleaning | 9/10 |
| Feature Engineering | 8.5/10 |
| Statistical Analysis | 8/10 |
| Machine Learning | 7.5/10 |
| Pricing Logic | 6.5/10 |
| Production Readiness | 6/10 |

The primary limitation is not the methodology—it is the amount and diversity of data available. The current dataset is too small to reliably generalize across all product combinations.

---

# 1. Stop Thinking in "$/sqft"

This is the biggest improvement.

Windows are **not priced like flooring**.

Most manufacturers have costs that are composed of:

```
Price

=

Fixed Manufacturing Cost

+

Frame Cost

+

Glass Cost

+

Hardware Cost

+

Accessories

+

Profit
```

For example,

```
24×24

$250

↓

48×48

NOT

4× more expensive

Maybe

2.6×
```

because:

- Hardware remains almost constant.
- Manufacturing setup cost is fixed.
- Labour does not increase linearly.
- Frame perimeter grows differently than glass area.

Using a simple "$33 per sqft" hides these relationships.

Instead model:

```
Price

=

β₀

+

β₁ Area

+

β₂ Perimeter

+

β₃ Area²

+

β₄ Type

+

...
```

This better captures how manufacturers actually price products.

---

# 2. Don't Reduce Width and Height Into Area

Area alone loses valuable information.

Instead always keep:

- Width
- Height
- Area
- Perimeter
- Aspect Ratio

Example:

```
24 × 72

and

48 × 36

have

the same area

but

completely different costs.
```

Long narrow windows require:

- Longer frame extrusions
- Different reinforcement
- Different glass manufacturing
- Different hardware

These differences disappear if only area is used.

---

# 3. Build Separate Models Per Product Family

Currently all products are analyzed together.

Instead create independent pricing models for:

- Casement
- Fixed
- Slider
- Awning
- Patio Door
- Entry Door

Each product family has different pricing behavior.

This usually reduces prediction error significantly.

---

# 4. Avoid Fixed Option Premiums

The report assumes values such as:

```
Brickmould

+$30
```

In reality the cost is often dependent on window size.

More likely:

```
Brickmould Cost

=

Linear Feet

×

Material Rate
```

The same option may cost very different amounts depending on the dimensions.

---

# 5. Capture Manufacturer Rules

Most manufacturers contain hidden pricing thresholds.

Examples:

```
Width > 48"

↓

Steel Reinforcement Required

↓

+$75
```

or

```
Area > 25 sqft

↓

Thicker Glass

↓

Different Spacer

↓

Higher Price
```

These nonlinear thresholds should become explicit features in the model.

---

# 6. Perform Residual Analysis

Rather than only reporting MAPE, study where the model fails.

Example:

```
Predicted

$740

Actual

$1,020

Residual

+$280
```

Then ask:

Do these windows have something in common?

Examples:

- Patio Doors
- Dark Bronze
- Triple Pane
- Oversized
- Specialty Hardware
- Custom Shapes

Residual analysis often reveals missing features.

---

# 7. Use Hierarchical Pricing

Instead of predicting one final price directly:

```
Base Window

↓

Glass Upgrade

↓

Color Upgrade

↓

Hardware

↓

Installation Package

↓

Dealer Margin

↓

Final Quote
```

Advantages:

- Easier to explain to salespeople.
- Easier to debug.
- Easier to maintain.
- Easier to update when pricing changes.

---

# 8. Improve Confidence Scores

Current confidence appears derived from the model itself.

A stronger approach:

1. Find the 20 most similar historical windows.
2. Calculate average historical price.
3. Calculate standard deviation.
4. Convert that spread into a confidence score.

Example:

```
Nearest Historical Windows

Average

$842

Std Dev

$18

↓

Confidence

97%
```

Confidence is then based on actual historical similarity.

---

# 9. Missing High-Value Features

Several variables are missing that often have major pricing impact.

Examples:

- Manufacturer Series
- Product Collection
- Hardware Series
- Spacer Type
- Low-E Coating
- Interior Finish
- Exterior Finish
- Reinforcement
- Glass Thickness
- Jamb Depth
- Brickmould Width
- Handle Style

Some of these can change price by 20–40%.

---

# 10. Better Mathematical Model

Rather than:

```
Price

≈

33 × sqft
```

Use a multivariable pricing equation:

```
Price

=

β₀

+

β₁(Area)

+

β₂(Perimeter)

+

β₃(Area²)

+

β₄(Window Type)

+

β₅(Glass)

+

β₆(Frame)

+

β₇(Color)

+

β₈(Options)

+

β₉(Product Series)

+

ε
```

Where:

- β₀ = fixed manufacturing cost
- β₁ = area contribution
- β₂ = frame length contribution
- β₃ = oversized adjustment
- β₄–β₉ = option coefficients
- ε = remaining prediction error

This equation is significantly closer to how manufacturers actually calculate pricing.

---

# 11. Expand the Dataset

This is currently the biggest limitation.

Current dataset:

- 6 projects
- 180 line items
- Approximately 23% hold-out MAPE

Recommended target:

| Projects | Approx Line Items | Expected Accuracy |
|-----------|------------------:|------------------|
| 6 | 180 | ~20–25% |
| 50 | 2,000 | ~8–12% |
| 100 | 5,000 | ~5–7% |
| 250+ | 10,000+ | ~3–4% |

Fortunately, every historical quote contributes many window line items, allowing the dataset to grow quickly.

---

# Recommended Architecture

Instead of relying solely on machine learning, build a hybrid pricing engine.

## Layer 1 — Rule Engine

Responsible for:

- Manufacturer sizing rules
- Minimum charges
- Reinforcement thresholds
- Glass thickness changes
- Product eligibility
- Building code requirements

These are deterministic rules.

---

## Layer 2 — Pricing Model

Use regression or gradient boosting to estimate:

- Base manufacturing price
- Product family adjustments
- Option pricing
- Nonlinear size effects

---

## Layer 3 — Residual Correction Model

Train a second model on the prediction errors from Layer 2.

Purpose:

- Correct systematic underpricing
- Correct systematic overpricing
- Learn subtle interactions not captured by the primary model

---

# Final Recommendation

The report demonstrates that:

- Size is the dominant pricing factor.
- Product family is the second strongest driver.
- Options and glazing contribute meaningful adjustments.

The next evolution should shift away from simple "$/sqft" averages toward a **hybrid pricing engine** that combines:

- Manufacturer rules
- Engineering features
- Regression
- Gradient boosting
- Residual correction

This architecture is significantly more likely to achieve the desired **±3–4% pricing accuracy** while remaining transparent, explainable, and maintainable.