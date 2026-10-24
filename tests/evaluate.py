"""Match prediction and human annotation times. No ground-truth data is bundled."""
import argparse
import csv
import json
from pathlib import Path

def times(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as f:
        rows=list(csv.DictReader(f))
    if not rows:
        return []
    key=next((x for x in ['time','视频时间（秒）'] if x in rows[0]),None)
    if key is None:
        raise ValueError('CSV needs a time column in seconds')
    result=[float(row[key]) for row in rows]
    if any(t<0 for t in result) or result!=sorted(result):
        raise ValueError('Times must be nonnegative and sorted')
    return result

def evaluate(pred,truth,tolerance=.08):
    i=j=tp=fp=fn=0
    while i<len(pred) and j<len(truth):
        if abs(pred[i]-truth[j])<=tolerance:
            tp+=1;i+=1;j+=1
        elif pred[i]<truth[j]-tolerance:
            fp+=1;i+=1
        else:
            fn+=1;j+=1
    fp+=len(pred)-i;fn+=len(truth)-j
    n=len(truth)
    return {'ground_truth_count':n,'predicted_count':len(pred),'count_error':len(pred)-n,
            'absolute_count_error_per_100':abs(len(pred)-n)*100/n if n else None,
            'matched_events':tp,'false_positives':fp,'false_negatives':fn,
            'event_errors_per_100':(fp+fn)*100/n if n else None,
            'target_met_on_this_clip':bool(n>=100 and abs(len(pred)-n)*100/n<=1),
            'note':'Only this labelled clip is evaluated; no general accuracy guarantee.'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('predictions');p.add_argument('ground_truth');p.add_argument('--tolerance',type=float,default=.08)
    a=p.parse_args()
    print(json.dumps(evaluate(times(a.predictions),times(a.ground_truth),a.tolerance),ensure_ascii=False,indent=2))
