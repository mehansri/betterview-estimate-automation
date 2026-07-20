import pandas as pd

from training.features import engineer, row_to_feature_frame


def test_engineer_derived_features():
    df = pd.DataFrame(
        [
            {
                "type": "Casement",
                "width": 50,
                "height": 60,
                "area": 3000,
                "frame": "Vinyl",
                "glass": "Triple",
                "color": "Black",
                "grid": "None",
                "tempered": True,
                "shape": "Custom",
                "installation": "Replacement",
                "quantity": 1,
            }
        ]
    )
    out = engineer(df)
    assert out.loc[0, "aspect_ratio"] == 50 / 60
    assert out.loc[0, "oversized"] == 0  # 3000 not > 3000
    assert out.loc[0, "custom_shape"] == 1
    assert out.loc[0, "glass_layers"] == 3
    assert out.loc[0, "tempered"] == 1


def test_row_to_feature_frame():
    frame = row_to_feature_frame(
        {
            "type": "Casement",
            "width": 48,
            "height": 60,
            "frame": "Aluminum",
            "glass": "Triple",
            "color": "Black",
            "tempered": True,
        }
    )
    assert len(frame) == 1
    assert frame.loc[0, "area"] == 48 * 60
