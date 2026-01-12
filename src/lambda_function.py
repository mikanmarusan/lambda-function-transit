# coding: utf-8
import urllib2
import os
import re
import sys

def getRoute(jordan):
    # 空白行で分割
    jordan = jordan.strip()
    items = jordan.split('\r\n\r\n')
    route  = items[1]

    # 不要な文字を削除し詳細ルートを生成
    route = route.replace('｜ 　','｜')
    r = re.compile('\s+$', re.MULTILINE) #行末のスペース削除
    route = re.sub(r,r'',route)
    r = re.compile('\s{2,}(.*)$', re.MULTILINE)
    route = re.sub(r,r'',route)	

    return route
	
def getSummary(jordan):
    # 空白行で分割
    jordan = jordan.strip()
    items = jordan.split('\r\n\r\n')
    summary = items[0]

    # データの収集
    m = re.search('発着時間：(.*)\n', summary)
    if m:
        arrivalAndDepaturetime = re.sub('\r', '', m.group(1))
        m = re.search('所要時間：(.*)\n', summary)
    if m:
        requireTime = re.sub('\r', '', m.group(1))
        m = re.search('乗換回数：(.*)\n', summary)
    if m:
        transfer = re.sub('\r', '', m.group(1))
		
    # サマリを生成
    summary = arrivalAndDepaturetime + "(%s)" % requireTime + "(%s)" % transfer

    return summary

def lambda_handler(event, context):
    urls = [
            u"https://www.jorudan.co.jp/norikae/cgi/nori.cgi?rf=top&eok1=R-&eok2=R-&pg=0&eki1=%E5%85%AD%E6%9C%AC%E6%9C%A8%E4%B8%80%E4%B8%81%E7%9B%AE&Cmap1=&eki2=%E3%81%A4%E3%81%A4%E3%81%98%E3%83%B6%E4%B8%98%EF%BC%88%E6%9D%B1%E4%BA%AC%EF%BC%89&Cway=0&Cfp=1&Czu=2&S=%E6%A4%9C%E7%B4%A2&Csg=1&type=t"
        ]

    transfers = []
    
    #	
    # 乗り換え情報の取得と表示
    #
    for url in urls:	
        # 乗り換え情報
        result = urllib2.urlopen(url, None, 10)
        body = result.read()
        blocks = body.split('<hr size="1" color="black" />');
        blocks = blocks[2]

        summary = getSummary(blocks).decode('utf-8')
        route   = getRoute(blocks).decode('utf-8')
        transfers.append([summary, route])
        
    # 結果表示
    values = {
        'transfers': transfers
    }
    
    return values
