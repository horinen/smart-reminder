# 日程与提醒脚本参数

## schedule.mjs

### add
```
--title "标题"                           必填
--start "ISO时间"                        必填
--end "ISO时间"                          可选，默认 start 后 1 小时
--type important|routine|free            可选，默认 routine
--raw "原始自然语言表达"                  可选
```

### update
```
--id "日程ID"                            必填
--title --start --end --type --raw       可选，至少一个
```

### delete
```
--id "日程ID"                            必填
```

### list
```
--format smart|raw                       可选，默认 smart
  smart: 智能分组（今天/明天/本周）+ 统计
  raw: 简单列表，显示 ID（用于删除操作）
```

## reminder.mjs

### add
```
--time "YYYY-MM-DD HH:mm"               必填
--content "提醒内容"                     必填
```

### delete
```
--id "rm-xxx"                            必填
```

### list
```
无参数
```

## reminder-history.mjs

### list
```
无参数（默认 action），显示提醒历史和统计
```

### feedback
```
--id "提醒ID"                            必填
--type positive|negative|neutral|ignored  必填
--comment "评论"                         可选
```
