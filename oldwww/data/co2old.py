import pandas as pd
import numpy as np
import math
import sys

df = pd.read_csv("co2-old.csv")
# fill 1751..1849
y = df[:1]
for i in range(1751,1850):
	y = y.append(df[:1])

y.Year = np.linspace(1750,1849,100)
df = y.append(df)
df.reset_index(inplace=True)
df.Year.apply(int)

# interpolate to hours
df["p"] = pd.to_timedelta(df.index,unit="h")
df.set_index("p",drop=True,inplace=True)
df=df.resample("300s").interpolate()
df.Year = df.Year.apply(int)
df.drop(index=df[df.Year >= 1958].index,inplace=True)

# create integer index
df.reset_index(inplace=True,drop=True)
df["idx"] = list(df.index)
df.set_index("idx",drop=True,inplace=True)
df["Month"] = (np.array(df.index) % 12) + 1
df.drop(columns=["index"],inplace=True)
df.reset_index(inplace=True,drop=True)
df.to_csv("co2-old-monthly.csv",index=None,columns=["Year","Month","Avg"])
